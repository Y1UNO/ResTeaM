mod cache;
mod coffre;
mod commandes;
mod erreur;
mod images_locales;
mod jeu;
mod journal;
mod notifications;
mod partage;
mod preferences;
mod salon;
#[cfg(test)]
mod robustesse;
mod secrets;
mod session;
mod steam;

use std::fs;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

use cache::Cache;
use commandes::EtatApp;
use steam::webapi::ClientSteam;

/// « Quitter » choisi dans la zone de notification : la fermeture n'est plus interceptée.
static QUITTER: AtomicBool = AtomicBool::new(false);

/// Remet la fenêtre principale à l'écran (zone de notification, second lancement).
fn montrer(app: &AppHandle) {
    if let Some(f) = app.get_webview_window("main") {
        let _ = f.show();
        let _ = f.unminimize();
        let _ = f.set_focus();
    }
}

/// Icône de ResTeaM dans la zone de notification : clic pour ouvrir, menu pour quitter.
fn icone_notification(app: &tauri::App) -> tauri::Result<()> {
    let ouvrir = MenuItem::with_id(app, "ouvrir", "Ouvrir ResTeaM", true, None::<&str>)?;
    let bibliotheque = MenuItem::with_id(app, "bibliotheque", "Ma bibliothèque", true, None::<&str>)?;
    let telechargements = MenuItem::with_id(app, "telechargements", "Téléchargements", true, None::<&str>)?;
    let quitter = MenuItem::with_id(app, "quitter", "Quitter ResTeaM", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&ouvrir, &PredefinedMenuItem::separator(app)?, &bibliotheque, &telechargements, &PredefinedMenuItem::separator(app)?, &quitter],
    )?;
    let mut icone = TrayIconBuilder::with_id("resteam").tooltip("ResTeaM").menu(&menu).show_menu_on_left_click(false);
    if let Some(i) = app.default_window_icon() {
        icone = icone.icon(i.clone());
    }
    icone
        .on_menu_event(|app, evenement| match evenement.id().as_ref() {
            "ouvrir" => montrer(app),
            // Pages fixes : la fenêtre change de page (événement écouté par le front).
            page @ ("bibliotheque" | "telechargements") => {
                montrer(app);
                let _ = app.emit_to("main", "aller-a", page);
            }
            "quitter" => {
                QUITTER.store(true, Ordering::SeqCst);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|icone, evenement| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = evenement {
                montrer(icone.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Un seul ResTeaM : relancer l'exe (raccourci du Bureau) remet la fenêtre existante à l'écran.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| montrer(app)))
        .plugin(tauri_plugin_opener::init())
        // Images de Steam servies depuis le disque après le premier téléchargement.
        .register_asynchronous_uri_scheme_protocol("img", |ctx, requete, repondeur| {
            let app = ctx.app_handle().clone();
            let chemin = requete.uri().path().to_string();
            let plage = requete.headers().get("range").and_then(|v| v.to_str().ok()).map(str::to_owned);
            tauri::async_runtime::spawn(async move {
                let Some(cache) = app.try_state::<images_locales::CacheImages>() else {
                    repondeur.respond(tauri::http::Response::builder().status(503).body(Vec::new()).unwrap());
                    return;
                };
                repondeur.respond(cache.servir(&chemin, plage.as_deref()).await);
            });
        })
        .setup(|app| {
            let dossier = app.path().app_data_dir()?;
            fs::create_dir_all(&dossier)?;
            let cache = Cache::ouvrir(&dossier.join("cache.sqlite")).map_err(|e| e.to_string())?;
            let steam = ClientSteam::nouveau().map_err(|e| e.to_string())?;
            let dossier_images = dossier.join("images");
            app.manage(images_locales::CacheImages::nouveau(dossier_images.clone(), steam.http.clone(), dossier.join("perso")));
            std::thread::spawn(move || images_locales::elaguer(&dossier_images));
            app.manage(EtatApp { cache, steam, annulation: Mutex::new(None), redemarrage: Default::default() });
            app.manage(preferences::EtatPreferences::charger(&dossier));
            let prefs = preferences::lire(app.handle());

            icone_notification(app)?;
            // Lancé par Windows au démarrage : directement dans la zone de notification.
            let au_demarrage = std::env::args().any(|a| a == preferences::ARG_DEMARRAGE);
            if !au_demarrage {
                if let Some(f) = app.get_webview_window("main") {
                    let _ = f.show();
                    let _ = f.set_focus();
                }
            }
            // Steam lancé caché derrière ResTeaM.
            if prefs.steam_cache {
                if let Some(dossier_steam) = steam::local::dossier_steam() {
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = steam::installation::demarrer_steam_cache(&dossier_steam).await {
                            eprintln!("Steam caché : {e}");
                        }
                    });
                }
            }
            jeu::surveiller(app.handle().clone());
            // Coffre-fort : les données d'avant (session, cache) sont chiffrées une fois.
            let h = app.handle().clone();
            std::thread::spawn(move || {
                if let Err(e) = session::migrer(&h) {
                    eprintln!("coffre-fort (session) : {e}");
                }
                if let Err(e) = h.state::<EtatApp>().cache.chiffrer_anciennes() {
                    eprintln!("coffre-fort (cache) : {e}");
                }
            });
            notifications::installer(app.handle(), &dossier);
            // Une installation ou désinstallation en attente (ResTeaM fermé pendant un jeu) reprend.
            let handle = app.handle().clone();
            app.state::<EtatApp>().redemarrage.reprendre(&handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commandes::session_lire,
            commandes::desinstaller_jeu,
            commandes::fiche_jeu,
            commandes::avis_jeu,
            commandes::vitrine_magasin,
            commandes::config_pc,
            commandes::produits_magasin,
            commandes::recherche_magasin,
            commandes::rayon_magasin,
            commandes::liste_souhaits,
            commandes::classements,
            commandes::en_ligne,
            commandes::amis_possedant,
            commandes::profil_joueur,
            commandes::proprietes_jeu,
            commandes::regler_jeu,
            commandes::preferences_lire,
            commandes::preferences_ecrire,
            commandes::resteam_au_demarrage,
            commandes::jeu_session,
            commandes::bilan_trophees,
            commandes::journal_sessions,
            commandes::partage_etat,
            commandes::partage_connecter,
            commandes::partage_publier,
            commandes::partage_fichier,
            commandes::partage_retirer_fichier,
            commandes::partage_arreter,
            commandes::profil_partage,
            commandes::notification_essai,
            commandes::notifs_prendre,
            commandes::notifs_taille,
            commandes::notifs_clic,
            commandes::parametres_steam,
            commandes::regler_steam,
            commandes::annuler_reglage_steam,
            commandes::steam_au_demarrage,
            commandes::ouvrir_bibliotheque_steam,
            commandes::ouvrir_dossier_jeu,
            commandes::dlc_jeu,
            commandes::objets_profil,
            commandes::workshop_installe,
            commandes::mods_jeu,
            commandes::vitrine_workshop,
            commandes::mes_captures,
            commandes::ouvrir_captures,
            commandes::fil_amis,
            commandes::ouvrir_objet_workshop,
            commandes::fiche_mod,
            commandes::abonner_mod,
            commandes::etat_mod,
            commandes::ouvrir_youtube,
            commandes::ouvrir_salon,
            commandes::salon_etat,
            commandes::salon_action,
            commandes::enregistrer_media_perso,
            commandes::file_steam,
            commandes::annuler_file_steam,
            commandes::connexion_steam,
            commandes::connexion_annuler,
            commandes::deconnexion,
            commandes::cle_etat,
            commandes::cle_enregistrer,
            commandes::cle_supprimer,
            commandes::ouvrir_page_cle_api,
            commandes::joueur_moi,
            commandes::steam_local,
            commandes::jeux_installes,
            commandes::collections,
            commandes::bibliotheque,
            commandes::recemment_joues,
            commandes::niveau_badges,
            commandes::amis,
            commandes::succes_jeu,
            commandes::actus_jeu,
            commandes::images_jeux,
            commandes::steam_lien,
            commandes::patch_notes,
            commandes::options_installation,
            commandes::installer_jeu,
            commandes::stats_systeme,
        ])
        .on_window_event(|fenetre, evenement| {
            // Fermer = ranger dans la zone de notification (préférence), sauf « Quitter ».
            if let tauri::WindowEvent::CloseRequested { api, .. } = evenement {
                if fenetre.label() == "main" && !QUITTER.load(Ordering::SeqCst) && preferences::lire(fenetre.app_handle()).fermer_reduit {
                    api.prevent_close();
                    let _ = fenetre.hide();
                }
            }
            // Fermer ResTeaM ferme aussi le salon d'achat.
            if fenetre.label() == "main" && matches!(evenement, tauri::WindowEvent::Destroyed) {
                if let Some(s) = fenetre.app_handle().get_window(salon::FENETRE) {
                    let _ = s.close();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("erreur au lancement de ResTeaM");
}
