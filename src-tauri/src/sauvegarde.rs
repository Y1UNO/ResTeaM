//! Sauvegarde des données personnelles : les notes par jeu et le journal des
//! sessions. Dans l'app, elles sont chiffrées par Windows (DPAPI), donc liées à
//! la session Windows : une réinstallation de Windows les rendrait illisibles.
//!
//! La sauvegarde est un fichier JSON **lisible**, écrit seulement quand Tom le
//! demande, à un endroit fixe : `Documents\ResTeaM\sauvegarde-resteam.json`.
//! Le front ne choisit jamais le chemin. La reprise **fusionne** : rien n'est
//! effacé, la note la plus récente gagne, les sessions déjà connues sont ignorées.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::cache::Cache;
use crate::erreur::{Erreur, Resultat};
use crate::jeu::SessionJeu;
use crate::journal;
use crate::notes_jeu::{self, NoteJeu};

pub const DOSSIER: &str = "ResTeaM";
pub const FICHIER: &str = "sauvegarde-resteam.json";
const VERSION: u32 = 1;
/// Garde-fous à la reprise (fichier abîmé ou trafiqué).
const TAILLE_MAX_FICHIER: u64 = 64 * 1024 * 1024;
const MAX_NOTES: usize = 20_000;
const MAX_SESSIONS: usize = 500_000;
/// Une session de plus de 7 jours n'est pas crédible.
const DUREE_MAX_MS: i64 = 7 * 86_400_000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sauvegarde {
    pub version: u32,
    /// Millisecondes depuis 1970.
    pub cree_le: i64,
    /// Notes par jeu (clé : appid).
    #[serde(default)]
    pub notes: BTreeMap<u32, NoteJeu>,
    #[serde(default)]
    pub sessions: Vec<SessionJeu>,
}

/// Ce que le front affiche après une sauvegarde ou une reprise.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BilanSauvegarde {
    pub notes: usize,
    pub sessions: usize,
    pub chemin: String,
}

/// Rassemble toutes les notes et toutes les sessions terminées.
pub fn rassembler(cache: &Cache, maintenant_ms: i64) -> Resultat<Sauvegarde> {
    let mut notes = BTreeMap::new();
    for cle in cache.cles("notes:")? {
        let Some(app_id) = cle.strip_prefix("notes:").and_then(|s| s.parse::<u32>().ok()) else { continue };
        if let Some(note) = cache.frais::<NoteJeu>(&cle)? {
            notes.insert(app_id, note);
        }
    }
    let mut sessions = Vec::new();
    for cle in cache.cles("journal:")? {
        // `journal:en-cours` (partie pas finie) n'est pas une liste : ignorée ici.
        if let Some(liste) = cache.frais::<Vec<SessionJeu>>(&cle)? {
            sessions.extend(liste);
        }
    }
    sessions.sort_by_key(|s| (s.debut, s.app_id));
    Ok(Sauvegarde { version: VERSION, cree_le: maintenant_ms, notes, sessions })
}

/// Fusionne une sauvegarde dans le cache. Renvoie (notes reprises, sessions ajoutées).
pub fn restaurer(cache: &Cache, s: &Sauvegarde) -> Resultat<(usize, usize)> {
    if s.version != VERSION {
        return Err(Erreur::Interne("cette sauvegarde vient d'une autre version de ResTeaM".into()));
    }
    if s.notes.len() > MAX_NOTES || s.sessions.len() > MAX_SESSIONS {
        return Err(Erreur::Interne("sauvegarde trop grosse pour être reprise".into()));
    }
    let mut notes = 0;
    for (&app_id, note) in &s.notes {
        if app_id == 0 || note.texte.chars().count() > notes_jeu::TAILLE_MAX {
            continue;
        }
        // La note la plus récente gagne : on n'écrase pas ce que Tom a écrit depuis.
        let actuelle = notes_jeu::lire(cache, app_id)?;
        if actuelle.is_some_and(|a| a.modifie_le >= note.modifie_le) {
            continue;
        }
        if notes_jeu::ecrire(cache, app_id, &note.texte, note.modifie_le)?.is_some() {
            notes += 1;
        }
    }
    let mut sessions = 0;
    for session in &s.sessions {
        let Some(fin) = session.fin else { continue };
        let duree = fin.saturating_sub(session.debut);
        if session.app_id == 0 || session.debut <= 0 || duree < journal::DUREE_MIN_MS || duree > DUREE_MAX_MS {
            continue;
        }
        if journal::enregistrer(cache, *session)? {
            sessions += 1;
        }
    }
    Ok((notes, sessions))
}

/// Écrit la sauvegarde dans `dossier` (écriture atomique : fichier temporaire, puis renommage).
pub fn exporter(cache: &Cache, dossier: &Path, maintenant_ms: i64) -> Resultat<BilanSauvegarde> {
    let s = rassembler(cache, maintenant_ms)?;
    fs::create_dir_all(dossier).map_err(|e| Erreur::Interne(format!("dossier de sauvegarde : {e}")))?;
    let chemin = dossier.join(FICHIER);
    let provisoire = dossier.join(format!("{FICHIER}.tmp"));
    fs::write(&provisoire, serde_json::to_vec_pretty(&s)?).map_err(|e| Erreur::Interne(format!("écriture de la sauvegarde : {e}")))?;
    fs::rename(&provisoire, &chemin).map_err(|e| Erreur::Interne(format!("écriture de la sauvegarde : {e}")))?;
    Ok(BilanSauvegarde { notes: s.notes.len(), sessions: s.sessions.len(), chemin: chemin.to_string_lossy().into_owned() })
}

/// Reprend la sauvegarde de `dossier` (fusion, rien n'est effacé).
pub fn importer(cache: &Cache, dossier: &Path) -> Resultat<BilanSauvegarde> {
    let chemin = dossier.join(FICHIER);
    let infos = fs::metadata(&chemin).map_err(|_| Erreur::Interne(format!("aucune sauvegarde dans Documents\\{DOSSIER}")))?;
    if !infos.is_file() || infos.len() > TAILLE_MAX_FICHIER {
        return Err(Erreur::Interne("sauvegarde illisible".into()));
    }
    let octets = fs::read(&chemin).map_err(|e| Erreur::Interne(format!("lecture de la sauvegarde : {e}")))?;
    let s: Sauvegarde = serde_json::from_slice(&octets).map_err(|_| Erreur::Interne("sauvegarde illisible".into()))?;
    let (notes, sessions) = restaurer(cache, &s)?;
    Ok(BilanSauvegarde { notes, sessions, chemin: chemin.to_string_lossy().into_owned() })
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOV: i64 = 1_794_268_800_000; // 10 novembre 2026

    fn session(app_id: u32, debut: i64, minutes: i64) -> SessionJeu {
        SessionJeu { app_id, debut, fin: Some(debut + minutes * 60_000) }
    }

    #[test]
    fn aller_retour_et_fusion() {
        let a = Cache::en_memoire().unwrap();
        notes_jeu::ecrire(&a, 730, "Acte 2", 1_000).unwrap();
        notes_jeu::ecrire(&a, 570, "Build support", 2_000).unwrap();
        journal::enregistrer(&a, session(730, NOV, 90)).unwrap();
        journal::enregistrer(&a, session(570, NOV - 40 * 86_400_000, 30)).unwrap(); // un autre mois
        journal::garder_en_cours(&a, SessionJeu { app_id: 9, debut: NOV, fin: None }, NOV + 60_000).unwrap();
        let s = rassembler(&a, 5).unwrap();
        assert_eq!((s.notes.len(), s.sessions.len()), (2, 2));

        // Le fichier relu donne la même chose.
        let relu: Sauvegarde = serde_json::from_str(&serde_json::to_string(&s).unwrap()).unwrap();
        assert_eq!(relu, s);

        // Reprise dans un cache qui a déjà une note plus récente et une session en double.
        let b = Cache::en_memoire().unwrap();
        notes_jeu::ecrire(&b, 730, "Acte 3, plus récent", 9_000).unwrap();
        journal::enregistrer(&b, session(730, NOV, 90)).unwrap();
        assert_eq!(restaurer(&b, &s).unwrap(), (1, 1));
        assert_eq!(notes_jeu::lire(&b, 730).unwrap().unwrap().texte, "Acte 3, plus récent");
        assert_eq!(notes_jeu::lire(&b, 570).unwrap().unwrap().texte, "Build support");
        // Une seconde reprise n'ajoute rien.
        assert_eq!(restaurer(&b, &s).unwrap(), (0, 0));
        assert_eq!(journal::lire(&b, NOV - 60 * 86_400_000, NOV + 1).unwrap().len(), 2);
    }

    #[test]
    fn sauvegarde_piegee() {
        let c = Cache::en_memoire().unwrap();
        let mut s = Sauvegarde { version: VERSION, cree_le: 0, notes: BTreeMap::new(), sessions: vec![] };
        s.notes.insert(0, NoteJeu { texte: "jeu invalide".into(), modifie_le: 1 });
        s.notes.insert(1, NoteJeu { texte: "x".repeat(notes_jeu::TAILLE_MAX + 1), modifie_le: 1 });
        s.notes.insert(2, NoteJeu { texte: "  ".into(), modifie_le: 1 });
        s.sessions = vec![
            SessionJeu { app_id: 730, debut: NOV, fin: None },
            SessionJeu { app_id: 730, debut: NOV, fin: Some(NOV - 5) },
            SessionJeu { app_id: 730, debut: NOV, fin: Some(i64::MAX) },
            SessionJeu { app_id: 730, debut: i64::MIN, fin: Some(i64::MAX) },
            SessionJeu { app_id: 0, debut: NOV, fin: Some(NOV + 3_600_000) },
            SessionJeu { app_id: 730, debut: -5, fin: Some(3_600_000) },
        ];
        assert_eq!(restaurer(&c, &s).unwrap(), (0, 0));
        s.version = 99;
        assert!(restaurer(&c, &s).is_err());
    }

    #[test]
    fn fichier_sur_le_disque() {
        let dossier = std::env::temp_dir().join(format!("resteam-sauvegarde-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dossier);
        let a = Cache::en_memoire().unwrap();
        assert!(importer(&a, &dossier).is_err()); // rien à reprendre
        notes_jeu::ecrire(&a, 730, "Acte 2", 1_000).unwrap();
        journal::enregistrer(&a, session(730, NOV, 90)).unwrap();
        let bilan = exporter(&a, &dossier, 5).unwrap();
        assert_eq!((bilan.notes, bilan.sessions), (1, 1));
        assert!(!dossier.join(format!("{FICHIER}.tmp")).exists());

        let b = Cache::en_memoire().unwrap();
        let repris = importer(&b, &dossier).unwrap();
        assert_eq!((repris.notes, repris.sessions), (1, 1));
        fs::write(dossier.join(FICHIER), b"{pas du json").unwrap();
        assert!(importer(&b, &dossier).is_err());
        let _ = fs::remove_dir_all(&dossier);
    }
}
