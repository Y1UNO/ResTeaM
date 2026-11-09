//! Aide de ResTeaM pour le Workshop.
//!
//! Steam n'offre aucune API web pour s'abonner à un objet du Workshop : seuls les
//! jeux le peuvent, par l'API Steamworks (`ISteamUGC`). Ce petit programme se
//! présente à Steam comme le jeu (`init_app`), s'abonne ou se désabonne, puis
//! s'arrête : Steam télécharge ou retire l'objet tout seul, en arrière-plan.
//!
//! Utilisation : `resteam-workshop.exe abonner|desabonner <appid> <objet>`.
//! Sortie : une ligne `OK` ou `ERREUR <message>`.
//!
//! Il est séparé de ResTeaM : `steam_api64.dll` n'est chargée que par lui, et
//! ResTeaM démarre même si l'aide ou la DLL manquent.

#![windows_subsystem = "windows"]

use std::sync::mpsc;
use std::time::{Duration, Instant};

use steamworks::{Client, PublishedFileId};

fn chiffres(s: &str) -> Option<u64> {
    (!s.is_empty() && s.len() <= 20 && s.bytes().all(|b| b.is_ascii_digit())).then(|| s.parse().ok()).flatten()
}

fn executer(args: &[String]) -> Result<(), String> {
    let [_, action, app, objet] = args else {
        return Err("usage : abonner|desabonner <appid> <objet>".into());
    };
    let app = chiffres(app).and_then(|a| u32::try_from(a).ok()).ok_or("jeu invalide")?;
    let objet = PublishedFileId(chiffres(objet).ok_or("objet invalide")?);
    if action != "abonner" && action != "desabonner" {
        return Err("action inconnue".into());
    }
    let client = Client::init_app(app).map_err(|e| format!("Steam refuse l'accès au jeu {app} ({e}). Steam est-il lancé, et possèdes-tu le jeu ?"))?;
    let ugc = client.ugc();
    let (tx, rx) = mpsc::channel();
    match action.as_str() {
        "abonner" => ugc.subscribe_item(objet, move |r| {
            let _ = tx.send(r);
        }),
        "desabonner" => ugc.unsubscribe_item(objet, move |r| {
            let _ = tx.send(r);
        }),
        _ => return Err("action inconnue".into()),
    }
    let debut = Instant::now();
    loop {
        client.run_callbacks();
        if let Ok(r) = rx.try_recv() {
            r.map_err(|e| format!("Steam a refusé : {e}"))?;
            break;
        }
        if debut.elapsed() > Duration::from_secs(20) {
            return Err("Steam ne répond pas".into());
        }
        std::thread::sleep(Duration::from_millis(40));
    }
    if action == "abonner" {
        // Passe l'objet en tête de la file de téléchargement de Steam.
        ugc.download_item(objet, true);
        for _ in 0..10 {
            client.run_callbacks();
            std::thread::sleep(Duration::from_millis(30));
        }
    }
    Ok(())
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    match executer(&args) {
        Ok(()) => println!("OK"),
        Err(e) => println!("ERREUR {}", e.replace('\n', " ")),
    }
}
