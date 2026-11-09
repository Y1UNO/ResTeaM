//! Lecture locale des fichiers de Steam (aucun réseau) :
//! dossiers de bibliothèque, jeux installés et téléchargements (`appmanifest_*.acf`),
//! favoris et collections (`userdata/<compte>/config/cloudstorage/…`).

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::vdf;

/// Redistribuables Steamworks : installés partout, jamais affichés comme des jeux.
const OUTILS: &[u32] = &[228980];

/// Composant partagé de Steam (redistribuables), jamais traité comme un jeu.
pub fn est_outil(app_id: u32) -> bool {
    OUTILS.contains(&app_id)
}
/// Écart entre un SteamID64 et l'identifiant de compte (dossier `userdata`).
const BASE_STEAMID64: u64 = 76561197960265728;

/// Dossier d'installation de Steam (registre Windows, puis emplacement par défaut).
pub fn dossier_steam() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
        use winreg::RegKey;
        let candidats = [
            (HKEY_CURRENT_USER, r"Software\Valve\Steam", "SteamPath"),
            (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath"),
            (HKEY_LOCAL_MACHINE, r"SOFTWARE\Valve\Steam", "InstallPath"),
        ];
        for (racine, cle, valeur) in candidats {
            if let Ok(c) = RegKey::predef(racine).open_subkey(cle) {
                if let Ok(chemin) = c.get_value::<String, _>(valeur) {
                    let p = PathBuf::from(chemin.replace('/', "\\"));
                    if p.join("steamapps").is_dir() {
                        return Some(p);
                    }
                }
            }
        }
    }
    let defaut = PathBuf::from(r"C:\Program Files (x86)\Steam");
    defaut.join("steamapps").is_dir().then_some(defaut)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DossierBibliotheque {
    pub chemin: String,
    pub nombre_jeux: usize,
}

/// Dossiers de bibliothèque déclarés dans `libraryfolders.vdf` (et qui existent).
pub fn dossiers_bibliotheque(steam: &Path) -> Vec<DossierBibliotheque> {
    let mut dossiers = Vec::new();
    if let Ok(texte) = fs::read_to_string(steam.join("steamapps").join("libraryfolders.vdf")) {
        let racine = vdf::lire(&texte);
        if let Some(liste) = racine.get("libraryfolders") {
            for (_, d) in liste.paires() {
                if let Some(chemin) = d.texte("path") {
                    if Path::new(chemin).join("steamapps").is_dir() {
                        dossiers.push(DossierBibliotheque {
                            chemin: chemin.to_string(),
                            nombre_jeux: d.get("apps").map(|a| a.paires().len()).unwrap_or(0),
                        });
                    }
                }
            }
        }
    }
    if dossiers.is_empty() {
        dossiers.push(DossierBibliotheque { chemin: steam.to_string_lossy().into_owned(), nombre_jeux: 0 });
    }
    dossiers
}

/// État d'un jeu installé, d'après `StateFlags`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EtatInstallation {
    Installe,
    MiseAJourRequise,
    Telechargement,
    EnPause,
    Autre,
}

/// `StateFlags` de Steam : 2 mise à jour requise, 4 installé, 512 en pause,
/// 256/1024/524288/1048576/2097152/4194304 = mise à jour ou téléchargement en cours.
pub fn etat_depuis_flags(flags: u32) -> EtatInstallation {
    const EN_COURS: u32 = 256 | 1024 | 524_288 | 1_048_576 | 2_097_152 | 4_194_304;
    if flags & 512 != 0 {
        EtatInstallation::EnPause
    } else if flags & EN_COURS != 0 {
        EtatInstallation::Telechargement
    } else if flags & 2 != 0 {
        EtatInstallation::MiseAJourRequise
    } else if flags & 4 != 0 {
        EtatInstallation::Installe
    } else {
        EtatInstallation::Autre
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JeuInstalle {
    pub app_id: u32,
    pub nom: String,
    pub dossier: String,
    pub bibliotheque: String,
    /// Octets sur le disque.
    pub taille: u64,
    pub etat: EtatInstallation,
    /// Téléchargement : octets à télécharger / déjà téléchargés.
    pub a_telecharger: u64,
    pub telecharge: u64,
    /// Secondes depuis 1970 (0 si inconnu).
    pub derniere_maj: i64,
    pub dernier_lancement: i64,
}

fn lire_manifeste(chemin: &Path, bibliotheque: &str) -> Option<JeuInstalle> {
    let texte = fs::read_to_string(chemin).ok()?;
    let racine = vdf::lire(&texte);
    let app = racine.get("AppState")?;
    let app_id: u32 = app.nombre("appid")?;
    if OUTILS.contains(&app_id) {
        return None;
    }
    let dossier = Path::new(bibliotheque)
        .join("steamapps")
        .join("common")
        .join(app.texte("installdir").unwrap_or_default());
    Some(JeuInstalle {
        app_id,
        nom: app.texte("name").unwrap_or_default().to_string(),
        dossier: dossier.to_string_lossy().into_owned(),
        bibliotheque: bibliotheque.to_string(),
        taille: app.nombre("SizeOnDisk").unwrap_or(0),
        etat: etat_depuis_flags(app.nombre("StateFlags").unwrap_or(0)),
        a_telecharger: app.nombre("BytesToDownload").unwrap_or(0),
        telecharge: app.nombre("BytesDownloaded").unwrap_or(0),
        derniere_maj: app.nombre("LastUpdated").unwrap_or(0),
        dernier_lancement: app.nombre("LastPlayed").unwrap_or(0),
    })
}

/// Tous les jeux installés, toutes bibliothèques confondues.
pub fn jeux_installes(steam: &Path) -> Vec<JeuInstalle> {
    let mut jeux = Vec::new();
    for d in dossiers_bibliotheque(steam) {
        let Ok(entrees) = fs::read_dir(Path::new(&d.chemin).join("steamapps")) else { continue };
        for e in entrees.flatten() {
            let nom = e.file_name();
            let nom = nom.to_string_lossy();
            if nom.starts_with("appmanifest_") && nom.ends_with(".acf") {
                if let Some(j) = lire_manifeste(&e.path(), &d.chemin) {
                    jeux.push(j);
                }
            }
        }
    }
    jeux.sort_by(|a, b| a.nom.to_lowercase().cmp(&b.nom.to_lowercase()));
    jeux.dedup_by_key(|j| j.app_id);
    jeux
}

// ——— Favoris et collections ———

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub nom: String,
    pub jeux: Vec<u32>,
    /// Collection dynamique (filtres) : ses jeux ne sont pas listés dans le fichier.
    pub dynamique: bool,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Collections {
    pub trouve: bool,
    pub favoris: Vec<u32>,
    pub caches: Vec<u32>,
    pub liste: Vec<Collection>,
}

#[derive(Deserialize)]
struct EntreeNuage {
    value: Option<String>,
    #[serde(default)]
    is_deleted: bool,
}

#[derive(Deserialize)]
struct ValeurCollection {
    #[serde(default)]
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    added: Vec<u32>,
    #[serde(default)]
    removed: Vec<u32>,
    #[serde(rename = "filterSpec")]
    filter_spec: Option<serde_json::Value>,
}

/// Une collection est dynamique si son filtre contient une recherche ou des options.
fn filtre_actif(spec: &serde_json::Value) -> bool {
    let recherche = spec.get("strSearchText").and_then(|v| v.as_str()).is_some_and(|s| !s.is_empty());
    let options = spec
        .get("filterGroups")
        .and_then(|g| g.as_array())
        .is_some_and(|groupes| {
            groupes.iter().any(|g| g.get("rgOptions").and_then(|o| o.as_array()).is_some_and(|o| !o.is_empty()))
        });
    recherche || options
}

pub fn lire_collections_json(texte: &str) -> Collections {
    let Ok(entrees) = serde_json::from_str::<Vec<(String, EntreeNuage)>>(texte) else {
        return Collections::default();
    };
    let mut c = Collections { trouve: true, ..Default::default() };
    for (cle, e) in entrees {
        let Some(id) = cle.strip_prefix("user-collections.") else { continue };
        if e.is_deleted {
            continue;
        }
        let Some(v) = e.value.as_deref().and_then(|v| serde_json::from_str::<ValeurCollection>(v).ok()) else {
            continue;
        };
        let jeux: Vec<u32> = v.added.iter().copied().filter(|a| !v.removed.contains(a)).collect();
        match id {
            "favorite" => c.favoris = jeux,
            "hidden" => c.caches = jeux,
            _ => c.liste.push(Collection {
                id: if v.id.is_empty() { id.to_string() } else { v.id },
                nom: v.name,
                jeux,
                dynamique: v.filter_spec.as_ref().is_some_and(filtre_actif),
            }),
        }
    }
    c.liste.sort_by(|a, b| a.nom.to_lowercase().cmp(&b.nom.to_lowercase()));
    c
}

/// Favoris et collections du compte `steam_id` (SteamID64).
pub fn collections(steam: &Path, steam_id: &str) -> Collections {
    let Some(compte) = steam_id.parse::<u64>().ok().and_then(|id| id.checked_sub(BASE_STEAMID64)) else {
        return Collections::default();
    };
    let chemin = steam
        .join("userdata")
        .join(compte.to_string())
        .join("config")
        .join("cloudstorage")
        .join("cloud-storage-namespace-1.json");
    fs::read_to_string(chemin).map(|t| lire_collections_json(&t)).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flags() {
        assert_eq!(etat_depuis_flags(4), EtatInstallation::Installe);
        assert_eq!(etat_depuis_flags(6), EtatInstallation::MiseAJourRequise);
        assert_eq!(etat_depuis_flags(1026), EtatInstallation::Telechargement);
        assert_eq!(etat_depuis_flags(1_048_578), EtatInstallation::Telechargement);
        assert_eq!(etat_depuis_flags(514), EtatInstallation::EnPause);
        assert_eq!(etat_depuis_flags(0), EtatInstallation::Autre);
    }

    #[test]
    fn collections_depuis_json() {
        let favori = serde_json::json!({"id":"favorite","name":"","added":[10,20,30],"removed":[20]}).to_string();
        let statique = serde_json::json!({"id":"uc-a","name":"Coop","added":[5],"removed":[],
            "filterSpec":{"strSearchText":"","filterGroups":[{"rgOptions":[],"bAcceptUnion":true}]}}).to_string();
        let dynamique = serde_json::json!({"id":"uc-b","name":"Récents","added":[],"removed":[],
            "filterSpec":{"strSearchText":"","filterGroups":[{"rgOptions":[3],"bAcceptUnion":true}]}}).to_string();
        let texte = serde_json::json!([
            ["user-collections.favorite", {"key":"user-collections.favorite","value": favori}],
            ["user-collections.uc-a", {"key":"user-collections.uc-a","value": statique}],
            ["user-collections.uc-b", {"key":"user-collections.uc-b","value": dynamique}],
            ["user-collections.uc-c", {"key":"user-collections.uc-c","is_deleted": true}],
            ["showcases", {"key":"showcases","value":"{}"}]
        ])
        .to_string();
        let c = lire_collections_json(&texte);
        assert!(c.trouve);
        assert_eq!(c.favoris, vec![10, 30]);
        assert_eq!(c.liste.len(), 2);
        let coop = c.liste.iter().find(|x| x.nom == "Coop").unwrap();
        assert_eq!(coop.jeux, vec![5]);
        assert!(!coop.dynamique);
        assert!(c.liste.iter().find(|x| x.nom == "Récents").unwrap().dynamique);
    }

    #[test]
    fn json_abime() {
        assert!(!lire_collections_json("pas du json").trouve);
    }

    /// Lit la vraie installation Steam de ce PC (ignoré par défaut).
    #[test]
    #[ignore]
    fn steam_de_ce_pc() {
        let steam = dossier_steam().expect("Steam introuvable");
        let dossiers = dossiers_bibliotheque(&steam);
        let jeux = jeux_installes(&steam);
        println!("Steam : {} · {} bibliothèque(s) · {} jeu(x) installé(s)", steam.display(), dossiers.len(), jeux.len());
        for j in &jeux {
            println!("  {} · {} · {:?} · {} Mo", j.app_id, j.nom, j.etat, j.taille / 1_000_000);
        }
        assert!(!jeux.is_empty());
    }
}
