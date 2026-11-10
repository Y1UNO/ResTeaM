//! Suivi du jeu lancé (« Remplacer Steam ») : Steam écrit l'appid du jeu en cours
//! dans le registre (`RunningAppID`). Toutes les 2 s, on le relit :
//! - un jeu démarre : ResTeaM se réduit (si la préférence le demande) et le front
//!   affiche « En cours » avec un minuteur ;
//! - le jeu se ferme : ResTeaM revient (seulement s'il s'était réduit lui-même) et
//!   le front affiche la durée de la session ;
//! - chaque session terminée part dans le journal (`journal.rs`).

use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::commandes::EtatApp;
use crate::steam::installation;
use crate::{journal, preferences};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionJeu {
    pub app_id: u32,
    /// Millisecondes depuis 1970.
    pub debut: i64,
    /// Fin (millisecondes), pour une session terminée.
    pub fin: Option<i64>,
}

#[derive(Debug, Clone, Copy, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EtatJeu {
    pub en_cours: Option<SessionJeu>,
    pub derniere: Option<SessionJeu>,
}

struct Suivi {
    etat: EtatJeu,
    /// ResTeaM s'est réduit lui-même au lancement : il revient à la fin.
    reduit_par_nous: bool,
}

static SUIVI: Mutex<Suivi> = Mutex::new(Suivi { etat: EtatJeu { en_cours: None, derniere: None }, reduit_par_nous: false });

pub fn etat() -> EtatJeu {
    SUIVI.lock().map(|s| s.etat).unwrap_or_default()
}

fn maintenant_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// Transition entre deux relevés du registre (pure : testée sans Windows).
/// Renvoie (session terminée, session commencée).
pub fn transition(avant: Option<SessionJeu>, jeu: Option<u32>, maintenant: i64) -> (Option<SessionJeu>, Option<SessionJeu>) {
    match (avant, jeu) {
        (Some(s), Some(id)) if s.app_id == id => (None, None),
        (None, None) => (None, None),
        (Some(s), suivant) => (
            Some(SessionJeu { fin: Some(maintenant), ..s }),
            suivant.map(|id| SessionJeu { app_id: id, debut: maintenant, fin: None }),
        ),
        (None, Some(id)) => (None, Some(SessionJeu { app_id: id, debut: maintenant, fin: None })),
    }
}

/// Lance la surveillance (une seule fois, au démarrage de ResTeaM).
pub fn surveiller(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Session interrompue par une fermeture de ResTeaM : reprise, ou enregistrée.
        let premier = tokio::task::spawn_blocking(installation::jeu_en_cours).await.ok().flatten();
        if let Some(etat) = app.try_state::<EtatApp>() {
            if let Some(gardee) = journal::lire_en_cours(&etat.cache) {
                if Some(gardee.app_id) == premier {
                    if let Ok(mut s) = SUIVI.lock() {
                        s.etat.en_cours = Some(SessionJeu { fin: None, ..gardee });
                    }
                } else {
                    let _ = journal::enregistrer(&etat.cache, gardee);
                    let _ = journal::oublier_en_cours(&etat.cache);
                }
            }
        }
        let mut tours: u32 = 0;
        loop {
            let jeu = tokio::task::spawn_blocking(installation::jeu_en_cours).await.ok().flatten();
            relever(&app, jeu);
            // Toutes les minutes, la session en cours est notée (au cas où ResTeaM se ferme).
            tours = tours.wrapping_add(1);
            if tours % 30 == 0 {
                if let (Some(s), Some(etat)) = (self::etat().en_cours, app.try_state::<EtatApp>()) {
                    let _ = journal::garder_en_cours(&etat.cache, s, maintenant_ms());
                }
            }
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    });
}

fn relever(app: &AppHandle, jeu: Option<u32>) {
    let (terminee, commencee, revenir) = {
        let Ok(mut s) = SUIVI.lock() else { return };
        let (terminee, commencee) = transition(s.etat.en_cours, jeu, maintenant_ms());
        if terminee.is_none() && commencee.is_none() {
            return;
        }
        if terminee.is_some() {
            s.etat.derniere = terminee;
        }
        s.etat.en_cours = commencee;
        let revenir = terminee.is_some() && commencee.is_none() && s.reduit_par_nous;
        if revenir {
            s.reduit_par_nous = false;
        }
        (terminee, commencee, revenir)
    };
    // Journal : la session terminée est gardée, la nouvelle est notée.
    if let Some(etat_app) = app.try_state::<EtatApp>() {
        let cache = &etat_app.cache;
        if let Some(t) = terminee {
            let _ = journal::enregistrer(cache, t);
        }
        match commencee {
            Some(c) => {
                let _ = journal::garder_en_cours(cache, c, maintenant_ms());
            }
            None => {
                let _ = journal::oublier_en_cours(cache);
            }
        }
    }
    let _ = app.emit("jeu-session", etat());
    let fenetre = app.get_webview_window("main");
    if commencee.is_some() && terminee.is_none() && preferences::lire(app).reduire_en_jeu {
        if let Some(f) = &fenetre {
            // Seulement si ResTeaM est à l'écran : rangé dans la zone de notification, il y reste.
            if f.is_visible().unwrap_or(false) && !f.is_minimized().unwrap_or(false) && f.minimize().is_ok() {
                if let Ok(mut s) = SUIVI.lock() {
                    s.reduit_par_nous = true;
                }
            }
        }
    }
    // Fin de partie : les notifications retenues (« ne pas déranger en jeu ») s'affichent.
    if terminee.is_some() && commencee.is_none() {
        crate::notifications::liberer(app);
    }
    if revenir {
        if let Some(f) = &fenetre {
            let _ = f.unminimize();
            let _ = f.set_focus();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transitions() {
        let s = |id, debut| SessionJeu { app_id: id, debut, fin: None };
        assert_eq!(transition(None, None, 5), (None, None));
        assert_eq!(transition(None, Some(730), 5), (None, Some(s(730, 5))));
        assert_eq!(transition(Some(s(730, 5)), Some(730), 9), (None, None));
        assert_eq!(transition(Some(s(730, 5)), None, 9), (Some(SessionJeu { fin: Some(9), ..s(730, 5) }), None));
        // Un autre jeu sans pause entre les deux : une fin et un début.
        assert_eq!(transition(Some(s(730, 5)), Some(570), 9), (Some(SessionJeu { fin: Some(9), ..s(730, 5) }), Some(s(570, 9))));
    }
}
