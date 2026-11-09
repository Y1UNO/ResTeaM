//! File des opérations qui demandent un redémarrage de Steam (demande de Tom, 9 nov. 2026).
//!
//! Installer ou désinstaller un jeu sans la fenêtre de Steam oblige à redémarrer Steam,
//! ce qui couperait le jeu en cours. Les opérations sont donc mises en file :
//! 1. tant qu'un jeu tourne (`RunningAppID`), on attend ;
//! 2. on ferme Steam proprement (`-shutdown`) ;
//! 3. Steam fermé, on supprime les fichiers des jeux à désinstaller ;
//! 4. on relance Steam en arrière-plan (`-silent`) et on cache sa fenêtre si elle s'ouvre.
//!
//! La file est gardée dans le cache : si ResTeaM se ferme avant la fin du jeu,
//! elle reprend au prochain lancement.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use super::proprietes::{self, Reglage};
use super::{installation, local, vdf};
use crate::commandes::EtatApp;
use crate::erreur::{Erreur, Resultat};

const CLE_CACHE: &str = "file-steam";
const TTL_FILE: i64 = 30 * 86_400;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    /// Rien à faire, ou la tâche n'a pas encore démarré.
    Repos,
    /// Un jeu tourne : on attend qu'il se ferme.
    AttenteJeu,
    /// Steam se ferme, les fichiers sont supprimés, Steam redémarre.
    Redemarrage,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileSteam {
    pub phase: Phase,
    /// Jeu qui bloque la file (appid), pendant `AttenteJeu`.
    pub jeu_en_cours: Option<u32>,
    /// Jeux dont le manifeste est écrit et qui attendent le redémarrage.
    pub installations: Vec<u32>,
    /// Jeux à supprimer pendant que Steam est fermé.
    pub desinstallations: Vec<u32>,
    /// Propriétés de jeux à écrire pendant que Steam est fermé (étape 10).
    #[serde(default)]
    pub reglages: Vec<Reglage>,
}

impl Default for FileSteam {
    fn default() -> Self {
        Self { phase: Phase::Repos, jeu_en_cours: None, installations: vec![], desinstallations: vec![], reglages: vec![] }
    }
}

impl FileSteam {
    fn vide(&self) -> bool {
        self.installations.is_empty() && self.desinstallations.is_empty() && self.reglages.is_empty()
    }
}

/// État partagé : la file et le drapeau « une tâche la traite déjà ».
#[derive(Default)]
pub struct Redemarrage {
    file: Mutex<FileSteam>,
    tache: Mutex<bool>,
}

impl Redemarrage {
    pub fn lire(&self) -> FileSteam {
        self.file.lock().map(|f| f.clone()).unwrap_or_default()
    }

    fn modifier(&self, app: &AppHandle, f: impl FnOnce(&mut FileSteam)) {
        if let Ok(mut file) = self.file.lock() {
            f(&mut file);
            let a_garder = FileSteam { phase: Phase::Repos, jeu_en_cours: None, ..file.clone() };
            if let Some(etat) = app.try_state::<EtatApp>() {
                let _ = etat.cache.ranger(CLE_CACHE, &a_garder, TTL_FILE);
            }
        }
    }

    pub fn ajouter_installation(&self, app: &AppHandle, app_id: u32) {
        self.modifier(app, |f| {
            f.desinstallations.retain(|id| *id != app_id);
            if !f.installations.contains(&app_id) {
                f.installations.push(app_id);
            }
        });
        self.demarrer(app);
    }

    pub fn ajouter_desinstallation(&self, app: &AppHandle, app_id: u32) {
        self.modifier(app, |f| {
            f.installations.retain(|id| *id != app_id);
            if !f.desinstallations.contains(&app_id) {
                f.desinstallations.push(app_id);
            }
        });
        self.demarrer(app);
    }

    /// Ajoute (ou complète) un réglage de jeu, appliqué au prochain arrêt de Steam.
    pub fn ajouter_reglage(&self, app: &AppHandle, r: Reglage) {
        self.modifier(app, |f| match f.reglages.iter_mut().find(|x| x.app_id == r.app_id) {
            Some(existant) => existant.fusionner(r),
            None => f.reglages.push(r),
        });
        self.demarrer(app);
    }

    /// Retire un jeu de la file. Pour une installation pas encore vue par Steam,
    /// le manifeste écrit par ResTeaM est supprimé.
    pub fn annuler(&self, app: &AppHandle, app_id: u32) -> Resultat<()> {
        let file = self.lire();
        if file.phase == Phase::Redemarrage {
            return Err(Erreur::Interne("Steam est en train de redémarrer : trop tard pour annuler".into()));
        }
        if file.installations.contains(&app_id) {
            if let Some(steam) = local::dossier_steam() {
                installation::retirer_manifeste_non_lu(&steam, app_id);
            }
        }
        self.modifier(app, |f| {
            f.installations.retain(|id| *id != app_id);
            f.desinstallations.retain(|id| *id != app_id);
            f.reglages.retain(|r| r.app_id != app_id);
        });
        Ok(())
    }

    /// Reprend la file gardée dans le cache (ResTeaM fermé avant la fin d'un jeu).
    pub fn reprendre(&self, app: &AppHandle) {
        let Some(etat) = app.try_state::<EtatApp>() else { return };
        let Ok(Some(gardee)) = etat.cache.frais::<FileSteam>(CLE_CACHE) else { return };
        if gardee.vide() {
            return;
        }
        if let Ok(mut f) = self.file.lock() {
            *f = FileSteam { phase: Phase::Repos, jeu_en_cours: None, ..gardee };
        }
        self.demarrer(app);
    }

    /// Lance la tâche qui traite la file, si elle ne tourne pas déjà.
    fn demarrer(&self, app: &AppHandle) {
        {
            let Ok(mut t) = self.tache.lock() else { return };
            if *t {
                return;
            }
            *t = true;
        }
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let r = traiter(&app).await;
            if let Some(etat) = app.try_state::<EtatApp>() {
                if let Ok(mut t) = etat.redemarrage.tache.lock() {
                    *t = false;
                }
                if let Err(e) = r {
                    eprintln!("file Steam : {e}");
                }
            }
        });
    }
}

async fn traiter(app: &AppHandle) -> Resultat<()> {
    let etat = app.state::<EtatApp>();
    let r = &etat.redemarrage;
    loop {
        if r.lire().vide() {
            r.modifier(app, |f| {
                f.phase = Phase::Repos;
                f.jeu_en_cours = None;
            });
            return Ok(());
        }
        // 1. Attendre que plus aucun jeu ne tourne.
        if let Some(id) = installation::jeu_en_cours() {
            r.modifier(app, |f| {
                f.phase = Phase::AttenteJeu;
                f.jeu_en_cours = Some(id);
            });
            tokio::time::sleep(Duration::from_secs(3)).await;
            continue;
        }
        // 2-4. Fermer Steam, supprimer, relancer.
        let a_traiter = r.lire();
        r.modifier(app, |f| {
            f.phase = Phase::Redemarrage;
            f.jeu_en_cours = None;
        });
        let steam = local::dossier_steam().ok_or(Erreur::SteamIntrouvable)?;
        let desinstallations = a_traiter.desinstallations.clone();
        let reglages = a_traiter.reglages.clone();
        let dossiers_raccourcis = dossiers_raccourcis(app);
        let resultat = installation::redemarrer_steam_avec(&steam, move |steam| {
            for r in &reglages {
                if let Err(e) = proprietes::appliquer(steam, r) {
                    eprintln!("réglages de {} : {e}", r.app_id);
                }
            }
            for id in &desinstallations {
                if let Err(e) = supprimer_jeu(steam, *id, &dossiers_raccourcis) {
                    eprintln!("désinstallation de {id} : {e}");
                }
            }
        })
        .await;
        r.modifier(app, |f| {
            f.phase = Phase::Repos;
            f.installations.retain(|id| !a_traiter.installations.contains(id));
            f.desinstallations.retain(|id| !a_traiter.desinstallations.contains(id));
            f.reglages.retain(|r| !a_traiter.reglages.contains(r));
        });
        resultat?;
        installation::cacher_fenetre_steam().await;
    }
}

/// Bureau et dossier Steam du menu Démarrer : on y retire les raccourcis du jeu.
fn dossiers_raccourcis(app: &AppHandle) -> Vec<PathBuf> {
    let mut d = Vec::new();
    if let Ok(bureau) = app.path().desktop_dir() {
        d.push(bureau);
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        d.push(Path::new(&appdata).join(r"Microsoft\Windows\Start Menu\Programs\Steam"));
    }
    d
}

/// `installdir` sûr : un seul nom de dossier, sans chemin ni lecteur.
fn installdir_sur(installdir: &str) -> bool {
    let t = installdir.trim();
    !t.is_empty() && t != "." && t != ".." && !t.contains(['/', '\\', ':']) && !t.contains("..")
}

/// Supprime un jeu, Steam étant fermé : dossier du jeu, manifeste, téléchargement
/// partiel, cache de shaders, contenu du Workshop et raccourcis `.url` qui le lancent.
pub fn supprimer_jeu(steam: &Path, app_id: u32, dossiers_raccourcis: &[PathBuf]) -> Resultat<()> {
    for biblio in local::dossiers_bibliotheque(steam) {
        let steamapps = Path::new(&biblio.chemin).join("steamapps");
        let manifeste = steamapps.join(format!("appmanifest_{app_id}.acf"));
        if !manifeste.exists() {
            continue;
        }
        let texte = fs::read_to_string(&manifeste)?;
        let racine = vdf::lire(&texte);
        let installdir = racine.get("AppState").and_then(|a| a.texte("installdir")).unwrap_or_default().to_string();
        if installdir_sur(&installdir) {
            let common = steamapps.join("common");
            let dossier = common.join(installdir.trim());
            // Garde-fou : le dossier résolu doit rester dans `steamapps\common`.
            if let (Ok(c), Ok(d)) = (common.canonicalize(), dossier.canonicalize()) {
                if d.starts_with(&c) && d != c {
                    supprimer_dossier(&d)?;
                }
            }
        }
        for annexe in [
            steamapps.join("downloading").join(app_id.to_string()),
            steamapps.join("shadercache").join(app_id.to_string()),
            steamapps.join("workshop").join("content").join(app_id.to_string()),
        ] {
            supprimer_dossier(&annexe)?;
        }
        let _ = fs::remove_file(steamapps.join("workshop").join(format!("appworkshop_{app_id}.acf")));
        fs::remove_file(&manifeste)?;
    }
    retirer_raccourcis(app_id, dossiers_raccourcis);
    Ok(())
}

fn supprimer_dossier(d: &Path) -> Resultat<()> {
    match fs::remove_dir_all(d) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
}

/// Retire les raccourcis `.url` dont la cible est exactement `steam://rungameid/<id>`.
fn retirer_raccourcis(app_id: u32, dossiers: &[PathBuf]) {
    let cible = format!("URL=steam://rungameid/{app_id}");
    for d in dossiers {
        let Ok(entrees) = fs::read_dir(d) else { continue };
        for e in entrees.flatten() {
            let p = e.path();
            if !p.extension().is_some_and(|x| x.eq_ignore_ascii_case("url")) {
                continue;
            }
            let Ok(t) = fs::read_to_string(&p) else { continue };
            if t.lines().any(|l| l.trim() == cible) {
                let _ = fs::remove_file(&p);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn noms_de_dossier() {
        assert!(installdir_sur("Hades"));
        assert!(installdir_sur("Counter-Strike Global Offensive"));
        assert!(!installdir_sur(""));
        assert!(!installdir_sur(".."));
        assert!(!installdir_sur("..\\..\\Windows"));
        assert!(!installdir_sur("C:\\Windows"));
        assert!(!installdir_sur("a/b"));
    }

    #[test]
    fn suppression_dans_une_fausse_bibliotheque() {
        let racine = std::env::temp_dir().join(format!("resteam-desinstall-{}", std::process::id()));
        let steamapps = racine.join("steamapps");
        fs::create_dir_all(steamapps.join("common").join("Jeu Test").join("bin")).unwrap();
        fs::create_dir_all(steamapps.join("common").join("Autre")).unwrap();
        fs::write(steamapps.join("common").join("Jeu Test").join("bin").join("a.exe"), "x").unwrap();
        fs::create_dir_all(steamapps.join("shadercache").join("4242")).unwrap();
        fs::write(
            steamapps.join("appmanifest_4242.acf"),
            "\"AppState\"\n{\n\t\"appid\"\t\t\"4242\"\n\t\"installdir\"\t\t\"Jeu Test\"\n}\n",
        )
        .unwrap();
        let raccourcis = racine.join("bureau");
        fs::create_dir_all(&raccourcis).unwrap();
        fs::write(raccourcis.join("Jeu Test.url"), "[InternetShortcut]\r\nURL=steam://rungameid/4242\r\n").unwrap();
        fs::write(raccourcis.join("Autre.url"), "[InternetShortcut]\r\nURL=steam://rungameid/42420\r\n").unwrap();
        // Fausse installation de Steam dont la bibliothèque est `racine`.
        let faux_steam = racine.join("steam");
        fs::create_dir_all(faux_steam.join("steamapps")).unwrap();
        fs::write(
            faux_steam.join("steamapps").join("libraryfolders.vdf"),
            format!(
                "\"libraryfolders\"\n{{\n\t\"0\"\n\t{{\n\t\t\"path\"\t\t\"{}\"\n\t}}\n}}\n",
                racine.to_string_lossy().replace('\\', "\\\\")
            ),
        )
        .unwrap();

        supprimer_jeu(&faux_steam, 4242, &[raccourcis.clone()]).unwrap();

        assert!(!steamapps.join("common").join("Jeu Test").exists());
        assert!(steamapps.join("common").join("Autre").exists());
        assert!(!steamapps.join("shadercache").join("4242").exists());
        assert!(!steamapps.join("appmanifest_4242.acf").exists());
        assert!(!raccourcis.join("Jeu Test.url").exists());
        assert!(raccourcis.join("Autre.url").exists());
        let _ = fs::remove_dir_all(&racine);
    }
}
