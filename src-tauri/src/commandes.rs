//! Commandes exposées au front (`invoke`). Toutes renvoient `{ code, message }` en cas d'erreur.

use std::sync::Mutex;

use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::oneshot;

use crate::cache::{Cache, Donnee};
use crate::erreur::{Erreur, Resultat};
use crate::secrets;
use crate::session::{self, Session};
use crate::steam::auth;
use crate::steam::webapi::{ClientSteam, Joueur};

/// Durée de vie en cache du profil de l'utilisateur.
const TTL_JOUEUR: i64 = 5 * 60;

pub struct EtatApp {
    pub cache: Cache,
    pub steam: ClientSteam,
    pub annulation: Mutex<Option<oneshot::Sender<()>>>,
}

fn session_requise(app: &AppHandle) -> Resultat<Session> {
    session::lire(app)?.ok_or(Erreur::SessionAbsente)
}

// ——— Session et connexion ———

#[tauri::command]
pub fn session_lire(app: AppHandle) -> Resultat<Option<Session>> {
    session::lire(&app)
}

/// Ouvre le navigateur sur Steam et attend la fin de la connexion.
#[tauri::command]
pub async fn connexion_steam(app: AppHandle, etat: State<'_, EtatApp>) -> Resultat<Session> {
    let (tx, rx) = oneshot::channel();
    if let Ok(mut a) = etat.annulation.lock() {
        // Une connexion déjà en cours est annulée au profit de la nouvelle.
        if let Some(ancienne) = a.replace(tx) {
            let _ = ancienne.send(());
        }
    }
    let resultat = auth::connecter(&app, &etat.steam.http, rx).await;
    if let Ok(mut a) = etat.annulation.lock() {
        a.take();
    }
    let session = Session { steam_id: resultat? };
    session::ecrire(&app, &session)?;
    etat.cache.vider()?;
    Ok(session)
}

#[tauri::command]
pub fn connexion_annuler(etat: State<'_, EtatApp>) {
    if let Ok(mut a) = etat.annulation.lock() {
        if let Some(tx) = a.take() {
            let _ = tx.send(());
        }
    }
}

/// Efface la session et le cache. La clé API est gardée.
#[tauri::command]
pub fn deconnexion(app: AppHandle, etat: State<'_, EtatApp>) -> Resultat<()> {
    session::effacer(&app)?;
    etat.cache.vider()
}

// ——— Clé Steam Web API (jamais renvoyée au front) ———

#[tauri::command]
pub fn cle_etat() -> Resultat<bool> {
    Ok(secrets::lire()?.is_some())
}

/// Vérifie la clé auprès de Steam, puis l'enregistre dans le Gestionnaire d'identifiants Windows.
#[tauri::command]
pub async fn cle_enregistrer(app: AppHandle, etat: State<'_, EtatApp>, cle: String) -> Resultat<()> {
    let cle = secrets::normaliser(&cle);
    if !secrets::format_valide(&cle) {
        return Err(Erreur::CleFormat);
    }
    let session = session_requise(&app)?;
    etat.steam.resume_joueur(&cle, &session.steam_id).await?;
    secrets::ecrire(&cle)?;
    etat.cache.vider()
}

#[tauri::command]
pub fn cle_supprimer(etat: State<'_, EtatApp>) -> Resultat<()> {
    secrets::supprimer()?;
    etat.cache.vider()
}

/// Ouvre la page Steam où l'on crée sa clé (adresse fixe, le front ne choisit pas l'URL).
#[tauri::command]
pub fn ouvrir_page_cle_api(app: AppHandle) -> Resultat<()> {
    app.opener()
        .open_url("https://steamcommunity.com/dev/apikey", None::<&str>)
        .map_err(|_| Erreur::Interne("impossible d'ouvrir le navigateur".into()))
}

// ——— Données Steam ———

/// Profil de l'utilisateur connecté (pseudo, avatar, statut).
#[tauri::command]
pub async fn joueur_moi(app: AppHandle, etat: State<'_, EtatApp>) -> Resultat<Donnee<Joueur>> {
    let session = session_requise(&app)?;
    let cle = secrets::lire()?.ok_or(Erreur::CleAbsente)?;
    let cle_cache = format!("joueur:{}", session.steam_id);
    etat.cache
        .avec_cache(&cle_cache, TTL_JOUEUR, || etat.steam.resume_joueur(&cle, &session.steam_id))
        .await
}
