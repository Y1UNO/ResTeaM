//! Connexion « Se connecter avec Steam » par OpenID 2.0, sans mot de passe :
//! 1. un petit serveur écoute sur 127.0.0.1 (port libre) ;
//! 2. le navigateur système s'ouvre sur la page de connexion de Steam ;
//! 3. Steam renvoie le navigateur vers notre serveur ;
//! 4. on vérifie la réponse (jeton d'état, return_to, puis `check_authentication`
//!    directement auprès de Steam) et on en extrait le SteamID64.

use std::time::Duration;

use reqwest::Client;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;
use url::form_urlencoded;
use url::Url;

use crate::erreur::{Erreur, Resultat};
use crate::session::steam_id_valide;

const FOURNISSEUR: &str = "https://steamcommunity.com/openid/login";
const NS: &str = "http://specs.openid.net/auth/2.0";
const SELECTION: &str = "http://specs.openid.net/auth/2.0/identifier_select";
const PREFIXE_ID: &str = "https://steamcommunity.com/openid/id/";
const DELAI_MAX: Duration = Duration::from_secs(5 * 60);

/// Lance la connexion et attend la réponse de Steam (5 minutes au plus).
pub async fn connecter(app: &AppHandle, http: &Client, annulation: oneshot::Receiver<()>) -> Resultat<String> {
    let ecoute = TcpListener::bind("127.0.0.1:0").await?;
    let port = ecoute.local_addr()?.port();
    let etat = jeton_aleatoire();
    let origine = format!("http://127.0.0.1:{port}");
    let return_to = format!("{origine}/retour?etat={etat}");

    let url = Url::parse_with_params(
        FOURNISSEUR,
        &[
            ("openid.ns", NS),
            ("openid.mode", "checkid_setup"),
            ("openid.return_to", return_to.as_str()),
            ("openid.realm", origine.as_str()),
            ("openid.identity", SELECTION),
            ("openid.claimed_id", SELECTION),
        ],
    )
    .map_err(|_| Erreur::Interne("URL OpenID".into()))?;

    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|_| Erreur::Interne("impossible d'ouvrir le navigateur".into()))?;

    let attente = async {
        loop {
            let (flux, _) = ecoute.accept().await?;
            if let Some(resultat) = traiter(flux, http, &etat, &return_to).await {
                return resultat;
            }
        }
    };

    let resultat = tokio::select! {
        r = attente => r,
        _ = annulation => Err(Erreur::Annule),
        _ = tokio::time::sleep(DELAI_MAX) => Err(Erreur::Delai),
    };

    if resultat.is_ok() {
        if let Some(fenetre) = app.get_webview_window("main") {
            let _ = fenetre.unminimize();
            let _ = fenetre.set_focus();
        }
    }
    resultat
}

/// Traite une requête du navigateur. `None` = requête sans rapport (favicon…), on continue d'attendre.
async fn traiter(mut flux: TcpStream, http: &Client, etat: &str, return_to: &str) -> Option<Resultat<String>> {
    let cible = lire_cible(&mut flux).await?;
    let Ok(url) = Url::parse(&format!("http://127.0.0.1{cible}")) else {
        repondre(&mut flux, 400, PAGE_ERREUR).await;
        return None;
    };
    if url.path() != "/retour" {
        repondre(&mut flux, 404, "").await;
        return None;
    }

    let params: Vec<(String, String)> = url.query_pairs().into_owned().collect();
    let valeur = |cle: &str| params.iter().find(|(k, _)| k == cle).map(|(_, v)| v.as_str());

    // Jeton d'état : la réponse doit venir de la connexion qu'on vient de lancer.
    if valeur("etat") != Some(etat) {
        repondre(&mut flux, 400, PAGE_ERREUR).await;
        return None;
    }
    if valeur("openid.mode") == Some("cancel") {
        repondre(&mut flux, 200, PAGE_ANNULEE).await;
        return Some(Err(Erreur::Annule));
    }

    let resultat = verifier(http, &params, return_to).await;
    let page = if resultat.is_ok() { PAGE_SUCCES } else { PAGE_ERREUR };
    repondre(&mut flux, 200, page).await;
    Some(resultat)
}

/// Vérifie la réponse OpenID et renvoie le SteamID64.
async fn verifier(http: &Client, params: &[(String, String)], return_to: &str) -> Resultat<String> {
    let valeur = |cle: &str| params.iter().find(|(k, _)| k == cle).map(|(_, v)| v.as_str());

    if valeur("openid.mode") != Some("id_res")
        || valeur("openid.ns") != Some(NS)
        || valeur("openid.op_endpoint") != Some(FOURNISSEUR)
        || valeur("openid.return_to") != Some(return_to)
    {
        return Err(Erreur::VerificationEchouee);
    }
    let id_revendique = valeur("openid.claimed_id").ok_or(Erreur::VerificationEchouee)?;
    if valeur("openid.identity") != Some(id_revendique) {
        return Err(Erreur::VerificationEchouee);
    }
    // Audit (étape 9) : la signature de Steam doit couvrir les champs qu'on utilise,
    // sinon une réponse signée pour un autre compte pourrait être détournée.
    if !champs_signes_complets(valeur("openid.signed").unwrap_or_default()) {
        return Err(Erreur::VerificationEchouee);
    }
    let steam_id = extraire_steam_id(id_revendique).ok_or(Erreur::VerificationEchouee)?;

    // Demande à Steam de confirmer la signature (mode check_authentication).
    let corps = {
        let mut s = form_urlencoded::Serializer::new(String::new());
        for (k, v) in params.iter().filter(|(k, _)| k.starts_with("openid.")) {
            let v = if k == "openid.mode" { "check_authentication" } else { v.as_str() };
            s.append_pair(k, v);
        }
        s.finish()
    };
    let rep = http
        .post(FOURNISSEUR)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(corps)
        .send()
        .await
        .map_err(|e| Erreur::from(e.without_url()))?;
    if !rep.status().is_success() {
        return Err(Erreur::Steam(format!("HTTP {}", rep.status().as_u16())));
    }
    let texte = rep.text().await.map_err(|e| Erreur::from(e.without_url()))?;
    if texte.lines().any(|l| l.trim() == "is_valid:true") {
        Ok(steam_id)
    } else {
        Err(Erreur::VerificationEchouee)
    }
}

/// Champs que la signature OpenID doit couvrir (`openid.signed`, sans le préfixe).
const CHAMPS_SIGNES: &[&str] = &["op_endpoint", "claimed_id", "identity", "return_to", "response_nonce", "assoc_handle"];

fn champs_signes_complets(signes: &str) -> bool {
    let liste: Vec<&str> = signes.split(',').map(str::trim).collect();
    CHAMPS_SIGNES.iter().all(|c| liste.contains(c))
}

/// `https://steamcommunity.com/openid/id/<17 chiffres>` → SteamID64, et rien d'autre.
pub fn extraire_steam_id(id_revendique: &str) -> Option<String> {
    let id = id_revendique.strip_prefix(PREFIXE_ID)?;
    steam_id_valide(id).then(|| id.to_string())
}

fn jeton_aleatoire() -> String {
    let octets: [u8; 16] = rand::random();
    octets.iter().map(|o| format!("{o:02x}")).collect()
}

/// Lit la ligne de requête HTTP (`GET /chemin HTTP/1.1`) et renvoie la cible.
pub(crate) async fn lire_cible(flux: &mut TcpStream) -> Option<String> {
    let mut tampon = vec![0u8; 16 * 1024];
    let mut lu = 0;
    loop {
        let n = tokio::time::timeout(Duration::from_secs(10), flux.read(&mut tampon[lu..]))
            .await
            .ok()?
            .ok()?;
        if n == 0 {
            break;
        }
        lu += n;
        if tampon[..lu].windows(4).any(|w| w == b"\r\n\r\n") || lu == tampon.len() {
            break;
        }
    }
    let texte = String::from_utf8_lossy(&tampon[..lu]);
    let mut morceaux = texte.lines().next()?.split_whitespace();
    if morceaux.next()? != "GET" {
        return None;
    }
    let cible = morceaux.next()?;
    cible.starts_with('/').then(|| cible.to_string())
}

pub(crate) async fn repondre(flux: &mut TcpStream, statut: u16, html: &str) {
    let raison = match statut {
        200 => "OK",
        400 => "Bad Request",
        _ => "Not Found",
    };
    let reponse = format!(
        "HTTP/1.1 {statut} {raison}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\n\
         Cache-Control: no-store\r\nConnection: close\r\n\r\n{html}",
        html.len()
    );
    let _ = flux.write_all(reponse.as_bytes()).await;
    let _ = flux.shutdown().await;
}

// Pages affichées dans le navigateur après la connexion (DA Nocturne, sans ressource externe).
pub(crate) const PAGE_SUCCES: &str = concat!(
    "<!doctype html><html lang=\"fr\"><meta charset=\"utf-8\"><title>ResTeaM · connecté</title>",
    "<style>html,body{margin:0;height:100%;background:#09090A;color:#F2F2F3;font-family:'Segoe UI',system-ui,sans-serif}",
    "body{display:flex;align-items:center;justify-content:center}.c{text-align:center;padding:40px 48px;border-radius:28px;",
    "background:rgba(18,18,20,.65);border:1px solid rgba(238,242,255,.12);box-shadow:0 40px 100px rgba(0,0,0,.9)}",
    "h1{margin:0 0 10px;font-size:30px;letter-spacing:-.5px}p{margin:0;color:#A3A3A8;font-size:15px}",
    ".d{width:10px;height:10px;border-radius:50%;background:#EEF2FF;box-shadow:0 0 14px rgba(238,242,255,.6);margin:0 auto 18px}</style>",
    "<div class=\"c\"><div class=\"d\"></div><h1>Connexion réussie</h1>",
    "<p>Tu peux fermer cet onglet et revenir dans ResTeaM.</p></div></html>"
);

const PAGE_ANNULEE: &str = concat!(
    "<!doctype html><html lang=\"fr\"><meta charset=\"utf-8\"><title>ResTeaM · annulé</title>",
    "<style>html,body{margin:0;height:100%;background:#09090A;color:#F2F2F3;font-family:'Segoe UI',system-ui,sans-serif}",
    "body{display:flex;align-items:center;justify-content:center}.c{text-align:center;padding:40px 48px;border-radius:28px;",
    "background:rgba(18,18,20,.65);border:1px solid rgba(238,242,255,.12)}h1{margin:0 0 10px;font-size:30px}",
    "p{margin:0;color:#A3A3A8;font-size:15px}</style>",
    "<div class=\"c\"><h1>Connexion annulée</h1><p>Tu peux fermer cet onglet.</p></div></html>"
);

pub(crate) const PAGE_ERREUR: &str = concat!(
    "<!doctype html><html lang=\"fr\"><meta charset=\"utf-8\"><title>ResTeaM · erreur</title>",
    "<style>html,body{margin:0;height:100%;background:#09090A;color:#F2F2F3;font-family:'Segoe UI',system-ui,sans-serif}",
    "body{display:flex;align-items:center;justify-content:center}.c{text-align:center;padding:40px 48px;border-radius:28px;",
    "background:rgba(18,18,20,.65);border:1px solid rgba(238,242,255,.12)}h1{margin:0 0 10px;font-size:30px}",
    "p{margin:0;color:#A3A3A8;font-size:15px}</style>",
    "<div class=\"c\"><h1>La connexion n'a pas abouti</h1><p>Reviens dans ResTeaM pour réessayer.</p></div></html>"
);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn steam_id_depuis_claimed_id() {
        assert_eq!(
            extraire_steam_id("https://steamcommunity.com/openid/id/76561198000000000").as_deref(),
            Some("76561198000000000")
        );
        // Domaine, schéma ou format différents : refusés.
        assert!(extraire_steam_id("http://steamcommunity.com/openid/id/76561198000000000").is_none());
        assert!(extraire_steam_id("https://steamcommunity.com.evil.io/openid/id/76561198000000000").is_none());
        assert!(extraire_steam_id("https://steamcommunity.com/openid/id/76561198000000000/").is_none());
        assert!(extraire_steam_id("https://steamcommunity.com/openid/id/123").is_none());
    }

    #[test]
    fn jeton() {
        let a = jeton_aleatoire();
        assert_eq!(a.len(), 32);
        assert_ne!(a, jeton_aleatoire());
    }

    fn params_valides(return_to: &str) -> Vec<(String, String)> {
        let id = "https://steamcommunity.com/openid/id/76561198000000000";
        [
            ("openid.ns", NS),
            ("openid.mode", "id_res"),
            ("openid.op_endpoint", FOURNISSEUR),
            ("openid.claimed_id", id),
            ("openid.identity", id),
            ("openid.return_to", return_to),
        ]
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
    }

    #[test]
    fn refus_avant_appel_a_steam() {
        // Ces cas échouent avant tout appel réseau.
        let http = Client::new();
        let rt = "http://127.0.0.1:5000/retour?etat=abc";
        let bloquer = |p: Vec<(String, String)>| tauri::async_runtime::block_on(verifier(&http, &p, rt));

        let mut p = params_valides(rt);
        p[5].1 = "http://127.0.0.1:5000/retour?etat=autre".into();
        assert!(matches!(bloquer(p), Err(Erreur::VerificationEchouee)));

        let mut p = params_valides(rt);
        p[2].1 = "https://faux.example/openid/login".into();
        assert!(matches!(bloquer(p), Err(Erreur::VerificationEchouee)));

        let mut p = params_valides(rt);
        p[4].1 = "https://steamcommunity.com/openid/id/76561198000000001".into();
        assert!(matches!(bloquer(p), Err(Erreur::VerificationEchouee)));
    }

    #[test]
    fn signature_qui_couvre_tout() {
        assert!(champs_signes_complets("signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle"));
        assert!(!champs_signes_complets("signed,op_endpoint,identity,return_to,response_nonce,assoc_handle"));
        assert!(!champs_signes_complets(""));
    }
}
