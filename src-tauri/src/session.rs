//! Session : le SteamID64 de l'utilisateur connecté (non secret), gardé dans
//! `session.json` pour rester connecté au redémarrage.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::erreur::{Erreur, Resultat};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub steam_id: String,
}

/// Un SteamID64 : exactement 17 chiffres.
pub fn steam_id_valide(id: &str) -> bool {
    id.len() == 17 && id.bytes().all(|b| b.is_ascii_digit())
}

fn chemin(app: &AppHandle) -> Resultat<PathBuf> {
    let dossier = app.path().app_data_dir()?;
    fs::create_dir_all(&dossier)?;
    Ok(dossier.join("session.json"))
}

pub fn lire(app: &AppHandle) -> Resultat<Option<Session>> {
    let chemin = chemin(app)?;
    if !chemin.exists() {
        return Ok(None);
    }
    // Coffre-fort : déchiffré par Windows (ancien fichier en clair : lu tel quel).
    let Some(texte) = crate::coffre::lire(&fs::read_to_string(chemin)?) else { return Ok(None) };
    match serde_json::from_str::<Session>(&texte) {
        Ok(s) if steam_id_valide(&s.steam_id) => Ok(Some(s)),
        // Fichier abîmé ou modifié : on repart d'une session vide.
        _ => Ok(None),
    }
}

pub fn ecrire(app: &AppHandle, session: &Session) -> Resultat<()> {
    if !steam_id_valide(&session.steam_id) {
        return Err(Erreur::VerificationEchouee);
    }
    fs::write(chemin(app)?, crate::coffre::chiffrer(&serde_json::to_string(session)?)?)?;
    Ok(())
}

/// Coffre-fort : une session gardée en clair (avant le coffre-fort) est réécrite chiffrée.
pub fn migrer(app: &AppHandle) -> Resultat<()> {
    let chemin = chemin(app)?;
    let Ok(texte) = fs::read_to_string(&chemin) else { return Ok(()) };
    if crate::coffre::est_chiffre(&texte) {
        return Ok(());
    }
    match lire(app)? {
        Some(s) => ecrire(app, &s),
        None => Ok(()),
    }
}

pub fn effacer(app: &AppHandle) -> Resultat<()> {
    let chemin = chemin(app)?;
    if chemin.exists() {
        fs::remove_file(chemin)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn steam_id() {
        assert!(steam_id_valide("76561198000000000"));
        assert!(!steam_id_valide("7656119800000000"));
        assert!(!steam_id_valide("76561198000000000a"));
        assert!(!steam_id_valide("7656119800000000a"));
        assert!(!steam_id_valide(""));
    }
}
