//! Partage du profil ResTeaM avec les amis (serveur `serveur/`, Cloudflare).
//!
//! - Connexion : le navigateur passe par le serveur, qui vérifie lui-même la connexion
//!   Steam puis renvoie un jeton sur 127.0.0.1. Le jeton est rangé dans le Gestionnaire
//!   d'identifiants Windows (jamais sur le disque). La clé API Steam n'est jamais envoyée.
//! - ResTeaM vérifie que le jeton correspond bien au compte connecté à ResTeaM.
//! - Envoi : style (choix du pinceau magique), photo et bannière choisies sur le PC.
//! - Lecture : le profil partagé d'un ami (style, photo, bannière), s'il en a un.

use std::path::{Path, PathBuf};
use std::time::Duration;

use keyring::Entry;
use reqwest::{Client, StatusCode};
use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use tokio::net::TcpListener;
use url::Url;

use crate::erreur::{Erreur, Resultat};
use crate::steam::auth;

/// Adresse du serveur de partage.
pub const SERVEUR: &str = "https://resteam-profils.resteam.workers.dev";
const HOTE: &str = "resteam-profils.resteam.workers.dev";
const COMPTE_JETON: &str = "partage-profil";
const DELAI_CONNEXION: Duration = Duration::from_secs(5 * 60);
pub const NOMS: [&str; 2] = ["avatar", "banniere"];
const EXTENSIONS: [&str; 6] = ["png", "jpg", "gif", "webp", "mp4", "webm"];

/// Une adresse vient-elle du serveur de partage ? (cache d'images, lecture des fichiers)
pub fn adresse_du_serveur(adresse: &str) -> bool {
    Url::parse(adresse).is_ok_and(|u| u.scheme() == "https" && u.host_str() == Some(HOTE))
}

fn entree() -> Resultat<Entry> {
    Ok(Entry::new("ResTeaM", COMPTE_JETON)?)
}

pub fn jeton() -> Resultat<Option<String>> {
    match entree()?.get_password() {
        Ok(j) if jeton_valide(&j) => Ok(Some(j)),
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

fn ranger(j: &str) -> Resultat<()> {
    entree()?.set_password(j)?;
    Ok(())
}

pub fn oublier() -> Resultat<()> {
    match entree()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}

pub fn jeton_valide(j: &str) -> bool {
    j.len() == 64 && j.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}

/// Client pour les envois (bannière vidéo : jusqu'à 60 Mo, plus long que le client de Steam).
pub fn client_envoi() -> Resultat<Client> {
    Client::builder()
        .timeout(Duration::from_secs(10 * 60))
        .connect_timeout(Duration::from_secs(10))
        .user_agent("ResTeaM")
        .build()
        .map_err(|e| Erreur::Interne(format!("client : {e}")))
}

fn erreur_serveur(statut: StatusCode) -> Erreur {
    match statut.as_u16() {
        401 => Erreur::Interne("partage : connexion expirée, reconnecte-toi".into()),
        413 => Erreur::Interne("fichier trop lourd (photo : 15 Mo, bannière : 60 Mo)".into()),
        415 => Erreur::Interne("format refusé par le serveur (PNG, JPG, GIF, WebP, MP4, WebM)".into()),
        429 => Erreur::Quota,
        s => Erreur::Steam(format!("serveur de partage : HTTP {s}")),
    }
}

async fn reponse_json(rep: reqwest::Response) -> Resultat<Value> {
    let statut = rep.status();
    if !statut.is_success() {
        return Err(erreur_serveur(statut));
    }
    rep.json::<Value>().await.map_err(|e| Erreur::from(e.without_url()))
}

/// Connexion : le navigateur passe par le serveur, qui vérifie la connexion Steam,
/// puis revient ici (`/partage?etat=…&jeton=…`). Le compte doit être celui de ResTeaM.
pub async fn connecter(app: &AppHandle, http: &Client, steam_id_session: &str) -> Resultat<()> {
    let ecoute = TcpListener::bind("127.0.0.1:0").await?;
    let port = ecoute.local_addr()?.port();
    let etat: String = rand::random::<[u8; 16]>().iter().map(|o| format!("{o:02x}")).collect();
    let url = format!("{SERVEUR}/auth/debut?port={port}&etat={etat}");
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|_| Erreur::Interne("impossible d'ouvrir le navigateur".into()))?;

    let attente = async {
        loop {
            let (mut flux, _) = ecoute.accept().await?;
            let Some(cible) = auth::lire_cible(&mut flux).await else { continue };
            let Ok(u) = Url::parse(&format!("http://127.0.0.1{cible}")) else { continue };
            if u.path() != "/partage" {
                auth::repondre(&mut flux, 404, "").await;
                continue;
            }
            let v = |k: &str| u.query_pairs().find(|(c, _)| c == k).map(|(_, x)| x.into_owned());
            match (v("etat"), v("jeton")) {
                (Some(e), Some(j)) if e == etat && jeton_valide(&j) => {
                    auth::repondre(&mut flux, 200, auth::PAGE_SUCCES).await;
                    return Ok::<String, Erreur>(j);
                }
                _ => auth::repondre(&mut flux, 400, auth::PAGE_ERREUR).await,
            }
        }
    };
    let jeton = tokio::time::timeout(DELAI_CONNEXION, attente).await.map_err(|_| Erreur::Delai)??;

    // Le jeton doit appartenir au compte connecté à ResTeaM, sinon il est rendu tout de suite.
    let moi = reponse_json(http.get(format!("{SERVEUR}/moi")).bearer_auth(&jeton).send().await.map_err(|e| Erreur::from(e.without_url()))?).await?;
    if moi["steamId"].as_str() != Some(steam_id_session) {
        let _ = http.post(format!("{SERVEUR}/deconnexion")).bearer_auth(&jeton).send().await;
        return Err(Erreur::Interne("ce compte Steam n'est pas celui connecté à ResTeaM".into()));
    }
    ranger(&jeton)
}

/// Mon profil partagé (`None` si le partage n'est pas actif). Jeton refusé : il est oublié.
pub async fn moi(http: &Client) -> Resultat<Option<Value>> {
    let Some(j) = jeton()? else { return Ok(None) };
    let rep = http.get(format!("{SERVEUR}/moi")).bearer_auth(&j).send().await.map_err(|e| Erreur::from(e.without_url()))?;
    if rep.status() == StatusCode::UNAUTHORIZED {
        oublier()?;
        return Ok(None);
    }
    reponse_json(rep).await.map(Some)
}

fn jeton_requis() -> Resultat<String> {
    jeton()?.ok_or_else(|| Erreur::Interne("partage non activé".into()))
}

pub async fn publier_style(http: &Client, style: &Value) -> Resultat<Value> {
    let j = jeton_requis()?;
    let corps = serde_json::to_string(style)?;
    if corps.len() > 16 * 1024 {
        return Err(Erreur::Interne("style trop grand".into()));
    }
    reponse_json(
        http.put(format!("{SERVEUR}/profil"))
            .bearer_auth(&j)
            .header("Content-Type", "application/json")
            .body(corps)
            .send()
            .await
            .map_err(|e| Erreur::from(e.without_url()))?,
    )
    .await
}

/// Fichier perso du PC (`perso/avatar.png`…), ou `None`.
pub fn fichier_perso(dossier: &Path, nom: &str) -> Option<PathBuf> {
    EXTENSIONS.iter().map(|e| dossier.join(format!("{nom}.{e}"))).find(|p| p.is_file())
}

pub async fn envoyer_fichier(dossier_perso: &Path, nom: &str) -> Resultat<Value> {
    if !NOMS.contains(&nom) {
        return Err(Erreur::Interne("fichier inconnu".into()));
    }
    let j = jeton_requis()?;
    let chemin = fichier_perso(dossier_perso, nom).ok_or_else(|| Erreur::Interne("aucun fichier choisi".into()))?;
    let octets = tokio::fs::read(&chemin).await?;
    let max = if nom == "avatar" { 15 } else { 60 } * 1024 * 1024;
    if octets.len() > max {
        return Err(erreur_serveur(StatusCode::PAYLOAD_TOO_LARGE));
    }
    reponse_json(
        client_envoi()?
            .put(format!("{SERVEUR}/fichiers/{nom}"))
            .bearer_auth(&j)
            .body(octets)
            .send()
            .await
            .map_err(|e| Erreur::from(e.without_url()))?,
    )
    .await
}

pub async fn retirer_fichier(http: &Client, nom: &str) -> Resultat<()> {
    if !NOMS.contains(&nom) {
        return Err(Erreur::Interne("fichier inconnu".into()));
    }
    let j = jeton_requis()?;
    reponse_json(http.delete(format!("{SERVEUR}/fichiers/{nom}")).bearer_auth(&j).send().await.map_err(|e| Erreur::from(e.without_url()))?).await?;
    Ok(())
}

/// Arrêter le partage : tout est effacé sur le serveur, et le jeton oublié ici.
pub async fn arreter(http: &Client) -> Resultat<()> {
    if let Some(j) = jeton()? {
        let rep = http.delete(format!("{SERVEUR}/profil")).bearer_auth(&j).send().await.map_err(|e| Erreur::from(e.without_url()))?;
        if !rep.status().is_success() && rep.status() != StatusCode::UNAUTHORIZED {
            return Err(erreur_serveur(rep.status()));
        }
    }
    oublier()
}

/// Profil partagé d'un joueur (`None` s'il ne partage pas).
pub async fn profil(http: &Client, steam_id: &str) -> Resultat<Option<Value>> {
    let rep = http.get(format!("{SERVEUR}/profils/{steam_id}")).send().await.map_err(|e| Erreur::from(e.without_url()))?;
    if rep.status() == StatusCode::NOT_FOUND {
        return Ok(None);
    }
    let v = reponse_json(rep).await?;
    // Les adresses de fichiers doivent pointer vers le serveur, et nulle part ailleurs.
    for nom in NOMS {
        if let Some(u) = v[nom]["url"].as_str() {
            if !adresse_du_serveur(u) {
                return Err(Erreur::Steam("serveur de partage : adresse inattendue".into()));
            }
        }
    }
    Ok(Some(v))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adresses_et_jetons() {
        assert!(adresse_du_serveur("https://resteam-profils.resteam.workers.dev/f/76561198000000000/avatar?v=1"));
        assert!(!adresse_du_serveur("http://resteam-profils.resteam.workers.dev/f/1/avatar"));
        assert!(!adresse_du_serveur("https://resteam-profils.resteam.workers.dev.evil.io/f/1/avatar"));
        assert!(!adresse_du_serveur("https://evil.io/resteam-profils.resteam.workers.dev"));
        assert!(jeton_valide(&"a".repeat(64)));
        assert!(!jeton_valide(&"A".repeat(64)));
        assert!(!jeton_valide(&"a".repeat(63)));
        assert!(!jeton_valide(&format!("{}&x", "a".repeat(62))));
    }

    #[test]
    fn fichiers_perso() {
        let d = std::env::temp_dir().join(format!("resteam-partage-{}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        assert_eq!(fichier_perso(&d, "avatar"), None);
        std::fs::write(d.join("avatar.gif"), b"GIF89a").unwrap();
        assert_eq!(fichier_perso(&d, "avatar"), Some(d.join("avatar.gif")));
        let _ = std::fs::remove_dir_all(&d);
    }
}
