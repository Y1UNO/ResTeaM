//! Cache disque des images de Steam (demande de Tom : « les images chargent lentement »).
//!
//! Le front demande `http://img.localhost/<adresse encodée>` ; ResTeaM télécharge
//! l'image une seule fois, la range dans `images/` (dossier de données de l'app) et la
//! sert ensuite depuis le disque. Seuls les CDN de Steam sont autorisés : le protocole
//! ne peut pas servir de relais vers un autre site.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use reqwest::Client;
use tauri::http::{Response, StatusCode};

/// Au-delà, les images les plus anciennes sont effacées au démarrage.
const TAILLE_MAX: u64 = 800 * 1024 * 1024;
const TAILLE_CIBLE: u64 = 600 * 1024 * 1024;

pub struct CacheImages {
    dossier: PathBuf,
    http: Client,
}

/// Hôtes autorisés : CDN d'images de Steam uniquement.
pub fn hote_autorise(adresse: &str) -> bool {
    let Ok(u) = url::Url::parse(adresse) else { return false };
    u.scheme() == "https"
        && u.host_str().is_some_and(|h| {
            h.ends_with(".steamstatic.com") || h == "steamcdn-a.akamaihd.net" || h.ends_with(".steamusercontent.com")
        })
}

/// Empreinte FNV-1a 64 bits : nom de fichier stable pour une adresse.
fn empreinte(s: &str) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in s.bytes() {
        h ^= u64::from(b);
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    format!("{h:016x}{:04x}", s.len() & 0xffff)
}

/// Type d'image d'après ses premiers octets.
fn type_image(octets: &[u8]) -> &'static str {
    match octets {
        [0xFF, 0xD8, ..] => "image/jpeg",
        [0x89, b'P', b'N', b'G', ..] => "image/png",
        [b'G', b'I', b'F', ..] => "image/gif",
        [b'R', b'I', b'F', b'F', _, _, _, _, b'W', b'E', b'B', b'P', ..] => "image/webp",
        _ => "application/octet-stream",
    }
}

fn reponse(statut: StatusCode, corps: Vec<u8>, type_: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(statut)
        .header("Content-Type", type_)
        .header("Cache-Control", "public, max-age=31536000, immutable")
        // Les couleurs de l'affiche sont lues dans un canvas : il faut le CORS.
        .header("Access-Control-Allow-Origin", "*")
        .body(corps)
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

impl CacheImages {
    pub fn nouveau(dossier: PathBuf, http: Client) -> Self {
        let _ = fs::create_dir_all(&dossier);
        Self { dossier, http }
    }

    /// Sert `/<adresse encodée>` : depuis le disque, sinon depuis Steam (puis rangée).
    pub async fn servir(&self, chemin: &str) -> Response<Vec<u8>> {
        let brut = chemin.trim_start_matches('/');
        let adresse = percent_encoding::percent_decode_str(brut).decode_utf8_lossy().into_owned();
        if !hote_autorise(&adresse) {
            return reponse(StatusCode::FORBIDDEN, Vec::new(), "text/plain");
        }
        let fichier = self.dossier.join(empreinte(&adresse));
        if let Ok(octets) = tokio::fs::read(&fichier).await {
            if !octets.is_empty() {
                let t = type_image(&octets);
                return reponse(StatusCode::OK, octets, t);
            }
        }
        let rep = match self.http.get(&adresse).send().await {
            Ok(r) => r,
            Err(_) => return reponse(StatusCode::BAD_GATEWAY, Vec::new(), "text/plain"),
        };
        if !rep.status().is_success() {
            let code = StatusCode::from_u16(rep.status().as_u16()).unwrap_or(StatusCode::NOT_FOUND);
            return reponse(code, Vec::new(), "text/plain");
        }
        let octets = match rep.bytes().await {
            Ok(o) => o.to_vec(),
            Err(_) => return reponse(StatusCode::BAD_GATEWAY, Vec::new(), "text/plain"),
        };
        // Écriture atomique : un fichier à moitié écrit n'est jamais servi.
        let temporaire = fichier.with_extension("part");
        if tokio::fs::write(&temporaire, &octets).await.is_ok() {
            let _ = tokio::fs::rename(&temporaire, &fichier).await;
        }
        let t = type_image(&octets);
        reponse(StatusCode::OK, octets, t)
    }
}

/// Garde le cache sous 800 Mo : on efface les images les moins récemment écrites.
pub fn elaguer(dossier: &Path) {
    let Ok(entrees) = fs::read_dir(dossier) else { return };
    let mut fichiers: Vec<(SystemTime, u64, PathBuf)> = entrees
        .flatten()
        .filter_map(|e| {
            let m = e.metadata().ok()?;
            m.is_file().then(|| (m.modified().unwrap_or(SystemTime::UNIX_EPOCH), m.len(), e.path()))
        })
        .collect();
    // Restes d'écritures interrompues.
    for (t, _, p) in &fichiers {
        if p.extension().is_some_and(|x| x == "part") && t.elapsed().unwrap_or_default() > Duration::from_secs(3600) {
            let _ = fs::remove_file(p);
        }
    }
    let mut total: u64 = fichiers.iter().map(|f| f.1).sum();
    if total <= TAILLE_MAX {
        return;
    }
    fichiers.sort_by_key(|f| f.0);
    for (_, taille, p) in fichiers {
        if total <= TAILLE_CIBLE {
            break;
        }
        if fs::remove_file(&p).is_ok() {
            total = total.saturating_sub(taille);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seuls_les_cdn_de_steam() {
        assert!(hote_autorise("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1/a.jpg"));
        assert!(hote_autorise("https://avatars.steamstatic.com/abc_full.jpg"));
        assert!(!hote_autorise("http://shared.akamai.steamstatic.com/a.jpg"));
        assert!(!hote_autorise("https://evil.com/steamstatic.com/a.jpg"));
        assert!(!hote_autorise("https://steamstatic.com.evil.com/a.jpg"));
        assert!(!hote_autorise("file:///C:/Windows/win.ini"));
    }

    #[test]
    fn empreinte_stable() {
        assert_eq!(empreinte("abc"), empreinte("abc"));
        assert_ne!(empreinte("abc"), empreinte("abd"));
    }

    #[test]
    fn types() {
        assert_eq!(type_image(&[0xFF, 0xD8, 0xFF]), "image/jpeg");
        assert_eq!(type_image(b"RIFF\0\0\0\0WEBPVP8"), "image/webp");
    }
}
