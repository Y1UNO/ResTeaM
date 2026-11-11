//! Cache SQLite (dossier de données de l'app) : clé, JSON, date de récupération,
//! date d'expiration. En cas d'erreur réseau, on sert la dernière valeur connue
//! avec le drapeau `horsLigne`.

use std::future::Future;
use std::path::Path;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension};
use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::erreur::{Erreur, Resultat};

pub struct Cache {
    conn: Mutex<Connection>,
}

struct Entree {
    json: String,
    recupere_le: i64,
    expire_le: i64,
}

/// Ce que reçoit le front : les données, et d'où elles viennent.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Donnee<T> {
    pub donnees: T,
    pub hors_ligne: bool,
    /// Secondes depuis 1970.
    pub recupere_le: i64,
}

/// Filtre SQL : tout sauf les données personnelles (notes par jeu, journal des sessions).
const PAS_PERSO: &str = "cle NOT LIKE 'notes:%' AND cle NOT LIKE 'journal:%'";

pub fn maintenant() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

impl Cache {
    pub fn ouvrir(chemin: &Path) -> Resultat<Self> {
        Self::depuis(Connection::open(chemin)?)
    }

    #[cfg(test)]
    pub fn en_memoire() -> Resultat<Self> {
        Self::depuis(Connection::open_in_memory()?)
    }

    fn depuis(conn: Connection) -> Resultat<Self> {
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS cache (
                 cle TEXT PRIMARY KEY,
                 json TEXT NOT NULL,
                 recupere_le INTEGER NOT NULL,
                 expire_le INTEGER NOT NULL
             );",
        )?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    fn verrou(&self) -> Resultat<std::sync::MutexGuard<'_, Connection>> {
        self.conn
            .lock()
            .map_err(|_| Erreur::Interne("cache verrouillé".into()))
    }

    fn lire(&self, cle: &str) -> Resultat<Option<Entree>> {
        let conn = self.verrou()?;
        let entree = conn
            .query_row(
                "SELECT json, recupere_le, expire_le FROM cache WHERE cle = ?1",
                params![cle],
                |r| {
                    Ok(Entree {
                        json: r.get(0)?,
                        recupere_le: r.get(1)?,
                        expire_le: r.get(2)?,
                    })
                },
            )
            .optional()?;
        // Coffre-fort : chaque valeur est chiffrée par Windows. Une valeur illisible
        // (autre session Windows, ligne abîmée) compte comme absente.
        Ok(entree.and_then(|e| crate::coffre::lire(&e.json).map(|json| Entree { json, ..e })))
    }

    fn ecrire(&self, cle: &str, json: &str, ttl_secondes: i64) -> Resultat<()> {
        let t = maintenant();
        let json = crate::coffre::chiffrer(json)?;
        self.verrou()?.execute(
            "INSERT INTO cache (cle, json, recupere_le, expire_le) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(cle) DO UPDATE SET json = ?2, recupere_le = ?3, expire_le = ?4",
            params![cle, json, t, t + ttl_secondes],
        )?;
        Ok(())
    }

    /// Coffre-fort : chiffre les valeurs encore en clair (cache d'avant le coffre-fort),
    /// puis compacte la base pour effacer leurs anciennes pages. Renvoie le nombre de lignes.
    pub fn chiffrer_anciennes(&self) -> Resultat<usize> {
        let conn = self.verrou()?;
        let anciennes: Vec<(String, String)> = {
            let mut req = conn.prepare("SELECT cle, json FROM cache WHERE json NOT LIKE 'rstm1:%'")?;
            let lignes = req.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
            lignes.filter_map(|l| l.ok()).collect()
        };
        for (cle, json) in &anciennes {
            conn.execute("UPDATE cache SET json = ?2 WHERE cle = ?1", params![cle, crate::coffre::chiffrer(json)?])?;
        }
        if !anciennes.is_empty() {
            conn.execute_batch("VACUUM")?;
        }
        Ok(anciennes.len())
    }

    /// Valeur encore fraîche, sans rien recharger.
    pub fn frais<T: DeserializeOwned>(&self, cle: &str) -> Resultat<Option<T>> {
        Ok(self
            .lire(cle)?
            .filter(|e| e.expire_le > maintenant())
            .and_then(|e| serde_json::from_str(&e.json).ok()))
    }

    /// Range une valeur pour `ttl_secondes`.
    pub fn ranger<T: Serialize>(&self, cle: &str, valeur: &T, ttl_secondes: i64) -> Resultat<()> {
        self.ecrire(cle, &serde_json::to_string(valeur)?, ttl_secondes)
    }

    /// Retire une seule valeur.
    pub fn retirer(&self, cle: &str) -> Resultat<()> {
        self.verrou()?.execute("DELETE FROM cache WHERE cle = ?1", params![cle])?;
        Ok(())
    }

    /// Vide le cache (connexion, déconnexion, changement de clé API). **Les données
    /// personnelles sont gardées** : les notes par jeu (`notes:`) et le journal des
    /// sessions (`journal:`) ne viennent pas de Steam et ne peuvent pas être rechargés.
    pub fn vider(&self) -> Resultat<()> {
        self.verrou()?.execute(&format!("DELETE FROM cache WHERE {PAS_PERSO}"), [])?;
        Ok(())
    }

    /// Élague les valeurs périmées depuis plus de `anciennete_secondes` (les valeurs
    /// périmées plus récentes servent encore au mode hors ligne). Les données
    /// personnelles ne sont jamais touchées. Renvoie le nombre de lignes retirées.
    pub fn elaguer(&self, anciennete_secondes: i64) -> Resultat<usize> {
        let limite = maintenant() - anciennete_secondes.max(0);
        let n = self.verrou()?.execute(&format!("DELETE FROM cache WHERE expire_le < ?1 AND {PAS_PERSO}"), params![limite])?;
        Ok(n)
    }

    /// Clés qui commencent par `prefixe` (sauvegarde des notes et du journal).
    pub fn cles(&self, prefixe: &str) -> Resultat<Vec<String>> {
        let conn = self.verrou()?;
        let mut req = conn.prepare("SELECT cle FROM cache WHERE substr(cle, 1, ?2) = ?1 ORDER BY cle")?;
        let lignes = req.query_map(params![prefixe, prefixe.chars().count() as i64], |r| r.get(0))?;
        Ok(lignes.filter_map(|l| l.ok()).collect())
    }

    /// Renvoie la valeur en cache si elle est fraîche, sinon la recharge.
    /// Si le rechargement échoue pour une raison passagère (réseau, quota),
    /// renvoie l'ancienne valeur avec `hors_ligne = true`.
    pub async fn avec_cache<T, F, Fut>(&self, cle: &str, ttl_secondes: i64, charger: F) -> Resultat<Donnee<T>>
    where
        T: Serialize + DeserializeOwned,
        F: FnOnce() -> Fut,
        Fut: Future<Output = Resultat<T>>,
    {
        let existant = self.lire(cle)?;
        if let Some(e) = &existant {
            if e.expire_le > maintenant() {
                if let Ok(donnees) = serde_json::from_str(&e.json) {
                    return Ok(Donnee { donnees, hors_ligne: false, recupere_le: e.recupere_le });
                }
            }
        }

        match charger().await {
            Ok(donnees) => {
                self.ecrire(cle, &serde_json::to_string(&donnees)?, ttl_secondes)?;
                Ok(Donnee { donnees, hors_ligne: false, recupere_le: maintenant() })
            }
            Err(err) if err.est_passagere() => match existant {
                Some(e) => Ok(Donnee {
                    donnees: serde_json::from_str(&e.json)?,
                    hors_ligne: true,
                    recupere_le: e.recupere_le,
                }),
                None => Err(err),
            },
            Err(err) => Err(err),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bloquer<F: Future>(f: F) -> F::Output {
        tauri::async_runtime::block_on(f)
    }

    #[test]
    fn migration_du_coffre_fort() {
        let c = Cache::en_memoire().unwrap();
        // Ligne écrite en clair (ancien format), puis migrée.
        c.verrou().unwrap().execute("INSERT INTO cache (cle, json, recupere_le, expire_le) VALUES ('a', '[1,2]', 0, 9999999999)", []).unwrap();
        c.ranger("b", &3, 60).unwrap();
        assert_eq!(c.frais::<Vec<u8>>("a").unwrap(), Some(vec![1, 2]));
        assert_eq!(c.chiffrer_anciennes().unwrap(), 1);
        assert_eq!(c.chiffrer_anciennes().unwrap(), 0);
        let brut: String = c.verrou().unwrap().query_row("SELECT json FROM cache WHERE cle = 'a'", [], |r| r.get(0)).unwrap();
        assert!(brut.starts_with("rstm1:"));
        assert_eq!(c.frais::<Vec<u8>>("a").unwrap(), Some(vec![1, 2]));
        assert_eq!(c.frais::<i32>("b").unwrap(), Some(3));
    }

    #[test]
    fn vider_garde_les_donnees_personnelles() {
        let c = Cache::en_memoire().unwrap();
        c.ranger("notes:730", &"ma note", 60).unwrap();
        c.ranger("journal:2026-11", &vec![1, 2], 60).unwrap();
        c.ranger("fiche3:730", &1, 60).unwrap();
        c.ranger("notesXfaux", &1, 60).unwrap();
        c.vider().unwrap();
        assert_eq!(c.frais::<String>("notes:730").unwrap().as_deref(), Some("ma note"));
        assert_eq!(c.frais::<Vec<i32>>("journal:2026-11").unwrap(), Some(vec![1, 2]));
        assert_eq!(c.frais::<i32>("fiche3:730").unwrap(), None);
        assert_eq!(c.frais::<i32>("notesXfaux").unwrap(), None);
        assert_eq!(c.cles("notes:").unwrap(), vec!["notes:730".to_string()]);
    }

    #[test]
    fn elagage_des_vieilles_valeurs() {
        let c = Cache::en_memoire().unwrap();
        let t = maintenant();
        let poser = |cle: &str, expire: i64| {
            c.verrou().unwrap().execute("INSERT INTO cache (cle, json, recupere_le, expire_le) VALUES (?1, '1', 0, ?2)", params![cle, expire]).unwrap();
        };
        poser("vieux", t - 40 * 86_400);
        poser("perime-recent", t - 86_400);
        poser("frais", t + 60);
        poser("notes:1", t - 400 * 86_400);
        poser("journal:2020-01", t - 400 * 86_400);
        assert_eq!(c.elaguer(30 * 86_400).unwrap(), 1);
        let reste: Vec<String> = c.cles("").unwrap();
        assert_eq!(reste, vec!["frais", "journal:2020-01", "notes:1", "perime-recent"]);
    }

    #[test]
    fn frais_puis_hors_ligne() {
        let c = Cache::en_memoire().unwrap();

        // Premier chargement : réseau OK.
        let d = bloquer(c.avec_cache("k", 60, || async { Ok::<_, Erreur>(41) })).unwrap();
        assert_eq!(d.donnees, 41);
        assert!(!d.hors_ligne);

        // Encore frais : le chargeur n'est pas appelé.
        let d = bloquer(c.avec_cache("k", 60, || async { Ok::<i32, Erreur>(99) })).unwrap();
        assert_eq!(d.donnees, 41);

        // Périmé + réseau coupé : ancienne valeur, drapeau hors ligne.
        c.vider().unwrap();
        let d = bloquer(c.avec_cache("k", -1, || async { Ok::<i32, Erreur>(42) })).unwrap();
        assert_eq!(d.donnees, 42);
        let d = bloquer(c.avec_cache("k", 60, || async { Err::<i32, _>(Erreur::Reseau) })).unwrap();
        assert_eq!(d.donnees, 42);
        assert!(d.hors_ligne);

        // Clé refusée : l'erreur remonte, pas de valeur en cache.
        c.vider().unwrap();
        let e = bloquer(c.avec_cache("k", 60, || async { Err::<i32, _>(Erreur::CleRefusee) }));
        assert!(matches!(e, Err(Erreur::CleRefusee)));
        // Réseau coupé sans rien en cache : erreur réseau.
        let e = bloquer(c.avec_cache("k", 60, || async { Err::<i32, _>(Erreur::Reseau) }));
        assert!(matches!(e, Err(Erreur::Reseau)));
    }
}
