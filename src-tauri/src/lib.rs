mod cache;
mod commandes;
mod erreur;
mod images_locales;
mod secrets;
mod session;
mod steam;

use std::fs;
use std::sync::Mutex;

use tauri::Manager;

use cache::Cache;
use commandes::EtatApp;
use steam::webapi::ClientSteam;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Images de Steam servies depuis le disque après le premier téléchargement.
        .register_asynchronous_uri_scheme_protocol("img", |ctx, requete, repondeur| {
            let app = ctx.app_handle().clone();
            let chemin = requete.uri().path().to_string();
            tauri::async_runtime::spawn(async move {
                let Some(cache) = app.try_state::<images_locales::CacheImages>() else {
                    repondeur.respond(tauri::http::Response::builder().status(503).body(Vec::new()).unwrap());
                    return;
                };
                repondeur.respond(cache.servir(&chemin).await);
            });
        })
        .setup(|app| {
            let dossier = app.path().app_data_dir()?;
            fs::create_dir_all(&dossier)?;
            let cache = Cache::ouvrir(&dossier.join("cache.sqlite")).map_err(|e| e.to_string())?;
            let steam = ClientSteam::nouveau().map_err(|e| e.to_string())?;
            let dossier_images = dossier.join("images");
            app.manage(images_locales::CacheImages::nouveau(dossier_images.clone(), steam.http.clone()));
            std::thread::spawn(move || images_locales::elaguer(&dossier_images));
            app.manage(EtatApp { cache, steam, annulation: Mutex::new(None), redemarrage: Default::default() });
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
            commandes::ouvrir_dossier_jeu,
            commandes::dlc_jeu,
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
        .run(tauri::generate_context!())
        .expect("erreur au lancement de ResTeaM");
}
