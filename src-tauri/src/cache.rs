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
        Ok(conn
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
            .optional()?)
    }

    fn ecrire(&self, cle: &str, json: &str, ttl_secondes: i64) -> Resultat<()> {
        let t = maintenant();
        self.verrou()?.execute(
            "INSERT INTO cache (cle, json, recupere_le, expire_le) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(cle) DO UPDATE SET json = ?2, recupere_le = ?3, expire_le = ?4",
            params![cle, json, t, t + ttl_secondes],
        )?;
        Ok(())
    }

    pub fn vider(&self) -> Resultat<()> {
        self.verrou()?.execute("DELETE FROM cache", [])?;
        Ok(())
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
