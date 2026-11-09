//! Paramètres de Steam réglés depuis ResTeaM (étape « Paramètres de Steam ») :
//!
//! - `config/config.vdf` (`InstallConfigStore > Software > Valve > Steam`) :
//!   `DownloadThrottleKbps` (limite de débit, en **kilobits** par seconde : Steam
//!   l'affiche en `valeur × 1000 / 8` octets ; 0 = sans limite),
//!   `AllowDownloadsDuringGameplay`, `StreamingThrottleEnabled` ;
//! - `userdata/<compte>/config/localconfig.vdf` (`UserLocalConfigStore > system`) :
//!   `EnableGameOverlay` ;
//! - démarrage de Steam avec Windows : valeur `Steam` de la clé `Run` de l'utilisateur.
//!
//! Clés vérifiées en lisant les fichiers du PC de Tom (sans rien modifier) et le
//! code de l'interface de Steam (`steamui/sp.js`). Steam réécrit ses fichiers en se
//! fermant : on ne les modifie que Steam fermé, par la file de redémarrage, après
//! une copie de sauvegarde. Seul le démarrage avec Windows s'applique tout de suite.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::installation::{self, Disque};
use super::{local, proprietes, vdf};
use crate::erreur::{Erreur, Resultat};

const BLOC_CONFIG: [&str; 4] = ["InstallConfigStore", "Software", "Valve", "Steam"];
const BLOC_SYSTEME: [&str; 2] = ["UserLocalConfigStore", "system"];
const BASE_STEAMID64: u64 = 76561197960265728;
/// 10 Gbit/s : au-delà, ce n'est plus une limite.
const LIMITE_MAX_KBPS: u32 = 10_000_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bibliotheque {
    pub disque: Disque,
    pub nombre_jeux: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParametresSteam {
    /// Limite de débit en kilobits par seconde (0 : sans limite).
    pub limite_kbps: u32,
    pub telechargements_en_jeu: bool,
    pub ralentir_streaming: bool,
    /// Overlay de Steam en jeu (compte connecté).
    pub overlay: bool,
    pub demarrage_windows: bool,
    pub bibliotheques: Vec<Bibliotheque>,
}

/// Changements demandés (seuls les champs présents sont écrits).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReglageSteam {
    /// SteamID64 du compte (pour l'overlay).
    pub compte: String,
    pub limite_kbps: Option<u32>,
    pub telechargements_en_jeu: Option<bool>,
    pub ralentir_streaming: Option<bool>,
    pub overlay: Option<bool>,
}

impl ReglageSteam {
    pub fn vide(&self) -> bool {
        self.limite_kbps.is_none() && self.telechargements_en_jeu.is_none() && self.ralentir_streaming.is_none() && self.overlay.is_none()
    }

    /// Réunit deux demandes (la plus récente l'emporte).
    pub fn fusionner(&mut self, autre: ReglageSteam) {
        if !autre.compte.is_empty() {
            self.compte = autre.compte;
        }
        self.limite_kbps = autre.limite_kbps.or(self.limite_kbps);
        self.telechargements_en_jeu = autre.telechargements_en_jeu.or(self.telechargements_en_jeu);
        self.ralentir_streaming = autre.ralentir_streaming.or(self.ralentir_streaming);
        self.overlay = autre.overlay.or(self.overlay);
    }

    pub fn valider(&self) -> Resultat<()> {
        if self.limite_kbps.is_some_and(|k| k > LIMITE_MAX_KBPS) {
            return Err(Erreur::Interne("limite de débit trop grande".into()));
        }
        if self.compte.len() != 17 || !self.compte.bytes().all(|b| b.is_ascii_digit()) {
            return Err(Erreur::Interne("compte invalide".into()));
        }
        Ok(())
    }
}

fn config(steam: &Path) -> PathBuf {
    steam.join("config").join("config.vdf")
}

fn localconfig(steam: &Path, compte: &str) -> Option<PathBuf> {
    let id = compte.parse::<u64>().ok()?.checked_sub(BASE_STEAMID64)?;
    Some(steam.join("userdata").join(id.to_string()).join("config").join("localconfig.vdf"))
}

fn noeud<'a>(v: &'a vdf::Vdf, chemin: &[&str]) -> Option<&'a vdf::Vdf> {
    chemin.iter().try_fold(v, |n, seg| n.get(seg))
}

fn booleen(v: Option<&vdf::Vdf>, cle: &str, defaut: bool) -> bool {
    v.and_then(|n| n.texte(cle)).map(|t| t.trim() == "1").unwrap_or(defaut)
}

/// Lit les paramètres dans les textes de `config.vdf` et `localconfig.vdf`.
pub fn lire_textes(config: &str, localconfig: &str) -> (u32, bool, bool, bool) {
    let c = vdf::lire(config);
    let n = noeud(&c, &BLOC_CONFIG);
    let limite = n.and_then(|n| n.nombre::<u32>("DownloadThrottleKbps")).unwrap_or(0);
    let l = vdf::lire(localconfig);
    let s = noeud(&l, &BLOC_SYSTEME);
    (
        limite,
        // Valeurs par défaut de Steam quand la clé n'existe pas encore.
        booleen(n, "AllowDownloadsDuringGameplay", false),
        booleen(n, "StreamingThrottleEnabled", true),
        booleen(s, "EnableGameOverlay", true),
    )
}

pub fn lire(steam: &Path, compte: &str) -> ParametresSteam {
    let texte_config = fs::read_to_string(config(steam)).unwrap_or_default();
    let texte_local = localconfig(steam, compte).and_then(|p| fs::read_to_string(p).ok()).unwrap_or_default();
    let (limite_kbps, telechargements_en_jeu, ralentir_streaming, overlay) = lire_textes(&texte_config, &texte_local);
    let comptes = local::dossiers_bibliotheque(steam);
    let bibliotheques = installation::disques(steam)
        .into_iter()
        .map(|d| {
            let nombre_jeux = comptes.iter().find(|b| b.chemin == d.bibliotheque).map(|b| b.nombre_jeux).unwrap_or(0);
            Bibliotheque { disque: d, nombre_jeux }
        })
        .collect();
    ParametresSteam { limite_kbps, telechargements_en_jeu, ralentir_streaming, overlay, demarrage_windows: demarrage_windows(), bibliotheques }
}

fn drapeau(v: bool) -> &'static str {
    if v { "1" } else { "0" }
}

/// Applique les réglages. **Steam doit être fermé** (appelé depuis la file de redémarrage).
pub fn appliquer(steam: &Path, r: &ReglageSteam) -> Resultat<()> {
    r.valider()?;
    let chemin = config(steam);
    if r.limite_kbps.is_some() || r.telechargements_en_jeu.is_some() || r.ralentir_streaming.is_some() {
        if !chemin.exists() {
            return Err(Erreur::Interne("config.vdf de Steam introuvable".into()));
        }
    }
    if let Some(k) = r.limite_kbps {
        proprietes::ecrire_cle(&chemin, &BLOC_CONFIG, "DownloadThrottleKbps", &k.to_string())?;
    }
    if let Some(v) = r.telechargements_en_jeu {
        proprietes::ecrire_cle(&chemin, &BLOC_CONFIG, "AllowDownloadsDuringGameplay", drapeau(v))?;
    }
    if let Some(v) = r.ralentir_streaming {
        proprietes::ecrire_cle(&chemin, &BLOC_CONFIG, "StreamingThrottleEnabled", drapeau(v))?;
    }
    if let Some(v) = r.overlay {
        let p = localconfig(steam, &r.compte).filter(|p| p.exists()).ok_or_else(|| Erreur::Interne("configuration du compte introuvable".into()))?;
        proprietes::ecrire_cle(&p, &BLOC_SYSTEME, "EnableGameOverlay", drapeau(v))?;
    }
    Ok(())
}

const CLE_RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";

/// Steam se lance-t-il avec Windows (valeur `Steam` de la clé `Run`) ?
pub fn demarrage_windows() -> bool {
    #[cfg(windows)]
    {
        use winreg::RegKey;
        use winreg::enums::HKEY_CURRENT_USER;
        return RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey(CLE_RUN)
            .and_then(|k| k.get_value::<String, _>("Steam"))
            .is_ok_and(|v| !v.trim().is_empty());
    }
    #[allow(unreachable_code)]
    false
}

/// Active ou coupe le démarrage de Steam avec Windows (caché, `-silent`, comme Steam).
pub fn regler_demarrage_windows(steam: &Path, actif: bool) -> Resultat<()> {
    #[cfg(windows)]
    {
        use winreg::RegKey;
        use winreg::enums::{HKEY_CURRENT_USER, KEY_SET_VALUE};
        let cle = RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(CLE_RUN, KEY_SET_VALUE)?;
        if actif {
            let exe = steam.join("steam.exe");
            if !exe.is_file() {
                return Err(Erreur::SteamIntrouvable);
            }
            cle.set_value("Steam", &format!("\"{}\" -silent", exe.display()))?;
        } else {
            match cle.delete_value("Steam") {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(e.into()),
            }
        }
        return Ok(());
    }
    #[allow(unreachable_code)]
    {
        let _ = (steam, actif);
        Err(Erreur::Interne("Windows uniquement".into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CONFIG: &str = "\"InstallConfigStore\"\n{\n\t\"Software\"\n\t{\n\t\t\"Valve\"\n\t\t{\n\t\t\t\"Steam\"\n\t\t\t{\n\t\t\t\t\"DownloadThrottleKbps\"\t\t\"8000\"\n\t\t\t\t\"AllowDownloadsDuringGameplay\"\t\t\"1\"\n\t\t\t}\n\t\t}\n\t}\n}\n";
    const LOCAL: &str = "\"UserLocalConfigStore\"\n{\n\t\"system\"\n\t{\n\t\t\"EnableGameOverlay\"\t\t\"0\"\n\t}\n}\n";

    #[test]
    fn lecture() {
        assert_eq!(lire_textes(CONFIG, LOCAL), (8000, true, true, false));
        // Fichiers vides : valeurs par défaut de Steam.
        assert_eq!(lire_textes("", ""), (0, false, true, true));
    }

    #[test]
    fn ecriture_en_memoire() {
        let t = vdf::modifier(CONFIG, &BLOC_CONFIG, "DownloadThrottleKbps", "0").unwrap();
        let t = vdf::modifier(&t, &BLOC_CONFIG, "StreamingThrottleEnabled", "0").unwrap();
        assert_eq!(lire_textes(&t, LOCAL), (0, true, false, false));
        let l = vdf::modifier(LOCAL, &BLOC_SYSTEME, "EnableGameOverlay", "1").unwrap();
        assert!(lire_textes(&t, &l).3);
    }

    #[test]
    fn validation_et_fusion() {
        let ok = ReglageSteam { compte: "76561198000000000".into(), limite_kbps: Some(8000), ..Default::default() };
        assert!(ok.valider().is_ok());
        assert!(ReglageSteam { limite_kbps: Some(LIMITE_MAX_KBPS + 1), ..ok.clone() }.valider().is_err());
        assert!(ReglageSteam { compte: "x".into(), ..ok.clone() }.valider().is_err());
        let mut a = ok.clone();
        a.fusionner(ReglageSteam { compte: ok.compte.clone(), overlay: Some(false), ..Default::default() });
        assert_eq!((a.limite_kbps, a.overlay), (Some(8000), Some(false)));
        assert!(ReglageSteam::default().vide());
    }

    /// Lecture seule sur le vrai PC : les clés existent là où on les attend.
    #[test]
    #[ignore = "lit les fichiers de Steam de ce PC"]
    fn lecture_de_ce_pc() {
        let steam = local::dossier_steam().unwrap();
        let t = fs::read_to_string(config(&steam)).unwrap();
        assert!(noeud(&vdf::lire(&t), &BLOC_CONFIG).is_some_and(|n| n.texte("DownloadThrottleKbps").is_some()));
    }
}
