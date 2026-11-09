//! Propriétés d'un jeu (étape 10), comme la fenêtre « Propriétés » de Steam :
//! options de lancement (`userdata/<compte>/config/localconfig.vdf`), mises à jour
//! automatiques et téléchargements pendant le jeu (manifeste), langue, DLC installés.
//!
//! Steam réécrit ces fichiers en se fermant : on ne les modifie que Steam fermé,
//! par la file de redémarrage (`redemarrage.rs`), après une copie de sauvegarde.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::{local, vdf};
use crate::erreur::{Erreur, Resultat};

const BASE_STEAMID64: u64 = 76561197960265728;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Reglage {
    pub app_id: u32,
    /// SteamID64 du compte dont on modifie la configuration.
    pub compte: String,
    pub options_lancement: Option<String>,
    /// 0 : toujours à jour · 1 : seulement au lancement · 2 : en priorité.
    pub maj_auto: Option<u8>,
    /// 0 : réglage global de Steam · 1 : toujours autorisés · 2 : jamais.
    pub telechargements_en_jeu: Option<u8>,
}

impl Reglage {
    /// Réunit deux demandes pour le même jeu (la plus récente l'emporte).
    pub fn fusionner(&mut self, autre: Reglage) {
        if autre.options_lancement.is_some() {
            self.options_lancement = autre.options_lancement;
        }
        if autre.maj_auto.is_some() {
            self.maj_auto = autre.maj_auto;
        }
        if autre.telechargements_en_jeu.is_some() {
            self.telechargements_en_jeu = autre.telechargements_en_jeu;
        }
    }

    pub fn valider(&self) -> Resultat<()> {
        if let Some(o) = &self.options_lancement {
            if o.chars().count() > 1024 || o.chars().any(|c| c.is_control()) {
                return Err(Erreur::Interne("options de lancement invalides (une seule ligne, 1024 caractères au plus)".into()));
            }
        }
        if self.maj_auto.is_some_and(|v| v > 2) || self.telechargements_en_jeu.is_some_and(|v| v > 2) {
            return Err(Erreur::Interne("réglage inconnu".into()));
        }
        if self.compte.len() != 17 || !self.compte.bytes().all(|b| b.is_ascii_digit()) {
            return Err(Erreur::Interne("compte invalide".into()));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Proprietes {
    pub app_id: u32,
    pub installe: bool,
    pub options_lancement: String,
    pub maj_auto: u8,
    pub telechargements_en_jeu: u8,
    /// Code de langue de Steam (`french`, `english`…).
    pub langue: Option<String>,
    pub dossier: Option<String>,
    pub taille: u64,
    /// Numéro de version (buildid).
    pub version: Option<String>,
    pub derniere_maj: i64,
    /// DLC installés (appids).
    pub dlc: Vec<u32>,
}

fn localconfig(steam: &Path, compte: &str) -> Option<PathBuf> {
    let id: u64 = compte.parse().ok()?;
    let compte = id.checked_sub(BASE_STEAMID64)?;
    Some(steam.join("userdata").join(compte.to_string()).join("config").join("localconfig.vdf"))
}

fn chemin_app(app_id: &str) -> [&str; 6] {
    ["UserLocalConfigStore", "Software", "Valve", "Steam", "apps", app_id]
}

/// Manifeste du jeu, dans la bibliothèque où il est installé.
pub fn manifeste(steam: &Path, app_id: u32) -> Option<PathBuf> {
    local::dossiers_bibliotheque(steam)
        .into_iter()
        .map(|d| Path::new(&d.chemin).join("steamapps").join(format!("appmanifest_{app_id}.acf")))
        .find(|p| p.exists())
}

pub fn lire(steam: &Path, compte: &str, app_id: u32) -> Proprietes {
    let id = app_id.to_string();
    let options_lancement = localconfig(steam, compte)
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|t| {
            let racine = vdf::lire(&t);
            let mut n = &racine;
            for seg in chemin_app(&id) {
                n = n.get(seg)?;
            }
            n.texte("LaunchOptions").map(str::to_string)
        })
        .unwrap_or_default();
    let mut p = Proprietes {
        app_id,
        installe: false,
        options_lancement,
        maj_auto: 0,
        telechargements_en_jeu: 0,
        langue: None,
        dossier: None,
        taille: 0,
        version: None,
        derniere_maj: 0,
        dlc: vec![],
    };
    let Some(chemin) = manifeste(steam, app_id) else { return p };
    let Ok(texte) = fs::read_to_string(&chemin) else { return p };
    let racine = vdf::lire(&texte);
    let Some(a) = racine.get("AppState") else { return p };
    p.installe = true;
    p.maj_auto = a.nombre("AutoUpdateBehavior").unwrap_or(0);
    p.telechargements_en_jeu = a.nombre("AllowOtherDownloadsWhileRunning").unwrap_or(0);
    p.langue = a.get("UserConfig").and_then(|u| u.texte("language")).map(str::to_string);
    p.taille = a.nombre("SizeOnDisk").unwrap_or(0);
    p.version = a.texte("buildid").map(str::to_string);
    p.derniere_maj = a.nombre("LastUpdated").unwrap_or(0);
    if let (Some(bib), Some(dir)) = (chemin.parent(), a.texte("installdir")) {
        p.dossier = Some(bib.join("common").join(dir).to_string_lossy().into_owned());
    }
    if let Some(depots) = a.get("InstalledDepots") {
        for (_, d) in depots.paires() {
            if let Some(dlc) = d.nombre::<u32>("dlcappid") {
                if !p.dlc.contains(&dlc) {
                    p.dlc.push(dlc);
                }
            }
        }
    }
    p
}

/// Copie de sauvegarde avant la première écriture de cette session de Steam fermé.
fn sauvegarder(chemin: &Path) {
    let copie = chemin.with_extension(format!(
        "{}.resteam.bak",
        chemin.extension().and_then(|e| e.to_str()).unwrap_or("vdf")
    ));
    let _ = fs::copy(chemin, copie);
}

pub(crate) fn ecrire_cle(chemin: &Path, bloc: &[&str], cle: &str, valeur: &str) -> Resultat<()> {
    let texte = fs::read_to_string(chemin)?;
    let nouveau = vdf::modifier(&texte, bloc, cle, valeur)
        .ok_or_else(|| Erreur::Interne(format!("structure inattendue dans {}", chemin.display())))?;
    if nouveau != texte {
        sauvegarder(chemin);
        let temporaire = chemin.with_extension("resteam.tmp");
        fs::write(&temporaire, nouveau)?;
        fs::rename(&temporaire, chemin)?;
    }
    Ok(())
}

/// Applique un réglage. **Steam doit être fermé** (appelé depuis la file de redémarrage).
pub fn appliquer(steam: &Path, r: &Reglage) -> Resultat<()> {
    r.valider()?;
    let id = r.app_id.to_string();
    if let Some(options) = &r.options_lancement {
        let chemin = localconfig(steam, &r.compte).ok_or_else(|| Erreur::Interne("compte introuvable".into()))?;
        if !chemin.exists() {
            return Err(Erreur::Interne("configuration du compte introuvable".into()));
        }
        ecrire_cle(&chemin, &chemin_app(&id), "LaunchOptions", options)?;
    }
    if r.maj_auto.is_some() || r.telechargements_en_jeu.is_some() {
        let chemin = manifeste(steam, r.app_id).ok_or_else(|| Erreur::Interne("ce jeu n'est pas installé".into()))?;
        if let Some(v) = r.maj_auto {
            ecrire_cle(&chemin, &["AppState"], "AutoUpdateBehavior", &v.to_string())?;
        }
        if let Some(v) = r.telechargements_en_jeu {
            ecrire_cle(&chemin, &["AppState"], "AllowOtherDownloadsWhileRunning", &v.to_string())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validation() {
        let ok = Reglage { app_id: 1, compte: "76561198000000000".into(), options_lancement: Some("-novid +fps_max 144".into()), ..Default::default() };
        assert!(ok.valider().is_ok());
        let ligne = Reglage { options_lancement: Some("a\nb".into()), ..ok.clone() };
        assert!(ligne.valider().is_err());
        let hors = Reglage { maj_auto: Some(3), ..ok.clone() };
        assert!(hors.valider().is_err());
        let compte = Reglage { compte: "123".into(), ..ok };
        assert!(compte.valider().is_err());
    }

    #[test]
    fn fusion() {
        let mut a = Reglage { app_id: 1, maj_auto: Some(1), ..Default::default() };
        a.fusionner(Reglage { app_id: 1, options_lancement: Some("-x".into()), ..Default::default() });
        assert_eq!(a.maj_auto, Some(1));
        assert_eq!(a.options_lancement.as_deref(), Some("-x"));
    }

    /// Lecture seule sur le vrai PC : la modification en mémoire de chaque
    /// `localconfig.vdf` garde toutes les autres valeurs (rien n'est écrit).
    #[test]
    #[ignore = "lit les fichiers de Steam de ce PC"]
    fn modification_sans_perte_sur_les_vrais_fichiers() {
        let steam = local::dossier_steam().unwrap();
        for e in fs::read_dir(steam.join("userdata")).unwrap().flatten() {
            let p = e.path().join("config").join("localconfig.vdf");
            let Ok(t) = fs::read_to_string(&p) else { continue };
            let avant = vdf::lire(&t);
            let s = vdf::modifier(&t, &chemin_app("1172470"), "LaunchOptions", "-test \"ok\"").unwrap();
            let apres = vdf::lire(&s);
            let app = |v: &vdf::Vdf| {
                let mut n = v.clone();
                for seg in chemin_app("1172470") {
                    n = n.get(seg).cloned().unwrap_or(vdf::Vdf::Objet(vec![]));
                }
                n
            };
            assert_eq!(app(&apres).texte("LaunchOptions"), Some("-test \"ok\""), "{}", p.display());
            // Tout le reste du document est identique.
            let s2 = vdf::modifier(&s, &chemin_app("1172470"), "LaunchOptions", app(&avant).texte("LaunchOptions").unwrap_or("")).unwrap();
            if app(&avant).texte("LaunchOptions").is_some() {
                assert_eq!(s2, t, "{}", p.display());
            }
            assert_eq!(apres.get("UserLocalConfigStore").map(|x| x.paires().len()), avant.get("UserLocalConfigStore").map(|x| x.paires().len()));
        }
    }
}
