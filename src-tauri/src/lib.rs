mod cache;
mod commandes;
mod erreur;
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
        .setup(|app| {
            let dossier = app.path().app_data_dir()?;
            fs::create_dir_all(&dossier)?;
            let cache = Cache::ouvrir(&dossier.join("cache.sqlite")).map_err(|e| e.to_string())?;
            let steam = ClientSteam::nouveau().map_err(|e| e.to_string())?;
            app.manage(EtatApp { cache, steam, annulation: Mutex::new(None) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commandes::session_lire,
            commandes::connexion_steam,
            commandes::connexion_annuler,
            commandes::deconnexion,
            commandes::cle_etat,
            commandes::cle_enregistrer,
            commandes::cle_supprimer,
            commandes::ouvrir_page_cle_api,
            commandes::joueur_moi,
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de ResTeaM");
}
