//! Préférences de ResTeaM (« Remplacer Steam », notifications), gardées dans
//! `preferences.json` du dossier de données. Rien de sensible : des interrupteurs.
//! Le lancement avec Windows, lui, vit dans la clé `Run` de l'utilisateur.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::erreur::{Erreur, Resultat};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Preferences {
    /// Fermer la fenêtre la range dans la zone de notification (ResTeaM reste actif).
    pub fermer_reduit: bool,
    /// Au démarrage de ResTeaM, lancer Steam caché s'il ne tourne pas.
    pub steam_cache: bool,
    /// ResTeaM se réduit quand un jeu se lance, et revient quand il se ferme.
    pub reduire_en_jeu: bool,
    /// Notifications Windows.
    pub notif_telechargement: bool,
    pub notif_maj: bool,
    pub notif_ami: bool,
    pub notif_promo: bool,
    /// Ne pas déranger en jeu : les notifications attendent la fin de la partie.
    pub notif_pas_en_jeu: bool,
    /// Coin de l'écran : `bd` (bas droite), `hd`, `bg`, `hg`.
    pub notif_coin: String,
    /// Durée d'affichage d'une notification, en secondes.
    pub notif_duree: u32,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            fermer_reduit: true,
            steam_cache: true,
            reduire_en_jeu: true,
            notif_telechargement: true,
            notif_maj: true,
            notif_ami: true,
            notif_promo: true,
            notif_pas_en_jeu: true,
            notif_coin: "bd".into(),
            notif_duree: 7,
        }
    }
}

/// Préférences en mémoire et leur fichier.
pub struct EtatPreferences {
    valeurs: Mutex<Preferences>,
    fichier: PathBuf,
}

impl EtatPreferences {
    pub fn charger(dossier: &Path) -> Self {
        let fichier = dossier.join("preferences.json");
        let valeurs = fs::read(&fichier).ok().and_then(|o| serde_json::from_slice(&o).ok()).unwrap_or_default();
        Self { valeurs: Mutex::new(valeurs), fichier }
    }

    pub fn lire(&self) -> Preferences {
        self.valeurs.lock().map(|p| p.clone()).unwrap_or_default()
    }

    pub fn ecrire(&self, mut p: Preferences) -> Resultat<()> {
        // Valeurs bornées : coin connu, durée de 3 à 30 s.
        if !["bd", "hd", "bg", "hg"].contains(&p.notif_coin.as_str()) {
            p.notif_coin = "bd".into();
        }
        p.notif_duree = p.notif_duree.clamp(3, 30);
        let json = serde_json::to_vec_pretty(&p)?;
        let temporaire = self.fichier.with_extension("json.tmp");
        fs::write(&temporaire, json)?;
        fs::rename(&temporaire, &self.fichier)?;
        if let Ok(mut v) = self.valeurs.lock() {
            *v = p;
        }
        Ok(())
    }
}

/// Préférences actuelles (valeurs par défaut si l'état n'est pas encore prêt).
pub fn lire(app: &AppHandle) -> Preferences {
    app.try_state::<EtatPreferences>().map(|e| e.lire()).unwrap_or_default()
}

const CLE_RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const VALEUR_RUN: &str = "ResTeaM";
/// Argument passé par Windows au démarrage : ResTeaM s'ouvre directement dans la zone de notification.
pub const ARG_DEMARRAGE: &str = "--demarrage";

/// ResTeaM se lance-t-il avec Windows ?
pub fn demarrage_windows() -> bool {
    #[cfg(windows)]
    {
        use winreg::RegKey;
        use winreg::enums::HKEY_CURRENT_USER;
        return RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey(CLE_RUN)
            .and_then(|k| k.get_value::<String, _>(VALEUR_RUN))
            .is_ok_and(|v| !v.trim().is_empty());
    }
    #[allow(unreachable_code)]
    false
}

/// Active ou coupe le lancement de ResTeaM avec Windows (l'exe actuel, caché).
pub fn regler_demarrage_windows(actif: bool) -> Resultat<()> {
    #[cfg(windows)]
    {
        use winreg::RegKey;
        use winreg::enums::{HKEY_CURRENT_USER, KEY_SET_VALUE};
        let cle = RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(CLE_RUN, KEY_SET_VALUE)?;
        if actif {
            let exe = std::env::current_exe()?;
            cle.set_value(VALEUR_RUN, &format!("\"{}\" {ARG_DEMARRAGE}", exe.display()))?;
        } else {
            match cle.delete_value(VALEUR_RUN) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(e.into()),
            }
        }
        return Ok(());
    }
    #[allow(unreachable_code)]
    {
        let _ = actif;
        Err(Erreur::Interne("Windows uniquement".into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lecture_partielle_et_ecriture() {
        // Un ancien fichier sans les nouvelles clés garde les valeurs par défaut.
        let p: Preferences = serde_json::from_str(r#"{"fermerReduit":false}"#).unwrap();
        assert!(!p.fermer_reduit && p.steam_cache && p.notif_ami);
        let dossier = std::env::temp_dir().join(format!("resteam-prefs-{}", std::process::id()));
        fs::create_dir_all(&dossier).unwrap();
        let e = EtatPreferences::charger(&dossier);
        assert_eq!(e.lire(), Preferences::default());
        e.ecrire(Preferences { notif_promo: false, ..Default::default() }).unwrap();
        assert!(!EtatPreferences::charger(&dossier).lire().notif_promo);
        let _ = fs::remove_dir_all(&dossier);
    }
}
