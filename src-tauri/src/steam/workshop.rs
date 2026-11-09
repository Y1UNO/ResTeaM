//! Communauté : mods du Workshop (installés et vitrine) et captures d'écran.
//!
//! - Mods installés : `steamapps/workshop/appworkshop_<id>.acf` de chaque bibliothèque.
//!   Sur un PC partagé, chaque mod dit quel compte s'y est abonné (`subscribedby`) :
//!   on ne garde que ceux du compte connecté.
//! - Détails d'un mod : `ISteamRemoteStorage/GetPublishedFileDetails` (public, sans clé).
//! - Vitrine d'un jeu : `IPublishedFileService/QueryFiles` (avec la clé, côté Rust).
//! - Captures : `userdata/<compte>/760/screenshots.vdf` et le dossier `remote/`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::local;
use super::vdf::{self, Vdf};

const BASE_STEAMID64: u64 = 76561197960265728;

/// Numéro de compte (SteamID64 − base), utilisé dans `userdata/` et `subscribedby`.
pub fn numero_compte(steam_id: &str) -> Option<u32> {
    steam_id.parse::<u64>().ok()?.checked_sub(BASE_STEAMID64).and_then(|n| u32::try_from(n).ok())
}

// ——— Mods installés ———

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModInstalle {
    pub id: String,
    pub taille: u64,
    /// Secondes depuis 1970.
    pub maj: i64,
    /// Une mise à jour attend d'être téléchargée.
    pub a_mettre_a_jour: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JeuWorkshop {
    pub app_id: u32,
    pub taille: u64,
    pub mods: Vec<ModInstalle>,
}

/// Lit un `appworkshop_<id>.acf` et garde les mods du compte donné.
pub fn lire_appworkshop(texte: &str, compte: u32) -> Option<JeuWorkshop> {
    let racine = vdf::lire(texte);
    let w = racine.get("AppWorkshop")?;
    let app_id = w.nombre::<u32>("appid")?;
    let details = w.get("WorkshopItemDetails");
    let compte = compte.to_string();
    let mut mods = Vec::new();
    for (id, item) in w.get("WorkshopItemsInstalled").map(Vdf::paires).unwrap_or_default() {
        if !id.bytes().all(|b| b.is_ascii_digit()) {
            continue;
        }
        let detail = details.and_then(|d| d.get(id));
        // Abonné par un autre compte du PC : pas à nous.
        if let Some(par) = detail.and_then(|d| d.texte("subscribedby")) {
            if par != compte {
                continue;
            }
        }
        let manifeste = item.texte("manifest");
        let dernier = detail.and_then(|d| d.texte("latest_manifest"));
        mods.push(ModInstalle {
            id: id.clone(),
            taille: item.nombre("size").unwrap_or(0),
            maj: item.nombre("timeupdated").unwrap_or(0),
            a_mettre_a_jour: matches!((manifeste, dernier), (Some(a), Some(b)) if a != b),
        });
    }
    if mods.is_empty() {
        return None;
    }
    mods.sort_by(|a, b| b.maj.cmp(&a.maj));
    Some(JeuWorkshop { app_id, taille: mods.iter().map(|m| m.taille).sum(), mods })
}

/// Tous les jeux qui ont des mods installés pour ce compte, du plus lourd au plus léger.
pub fn mods_installes(steam: &Path, compte: u32) -> Vec<JeuWorkshop> {
    let mut jeux: Vec<JeuWorkshop> = Vec::new();
    for biblio in local::dossiers_bibliotheque(steam) {
        let dossier = Path::new(&biblio.chemin).join("steamapps").join("workshop");
        let Ok(entrees) = std::fs::read_dir(&dossier) else { continue };
        for e in entrees.flatten() {
            let nom = e.file_name().to_string_lossy().into_owned();
            if !(nom.starts_with("appworkshop_") && nom.ends_with(".acf")) {
                continue;
            }
            let Ok(texte) = std::fs::read_to_string(e.path()) else { continue };
            if let Some(j) = lire_appworkshop(&texte, compte) {
                jeux.push(j);
            }
        }
    }
    jeux.sort_by(|a, b| b.taille.cmp(&a.taille));
    jeux
}

// ——— Objets du Workshop (détails et vitrine) ———

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjetWorkshop {
    pub id: String,
    pub app_id: u32,
    pub titre: String,
    /// Image d'aperçu (JPG, PNG ou GIF animé), ou vide.
    pub apercu: String,
    pub description: String,
    pub taille: u64,
    pub maj: i64,
    pub abonnes: u64,
    pub favoris: u64,
    pub vues: u64,
    /// Note de 0 à 1 (absente pour les détails publics).
    pub note: Option<f64>,
    pub votes: Option<u64>,
    pub tags: Vec<String>,
    /// Identifiant YouTube, pour les vidéos.
    pub video: Option<String>,
}

fn nombre(v: &Value) -> u64 {
    v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok())).unwrap_or(0)
}

/// Retire le BBCode de Steam ([b], [url=…], [img]…[/img]) et raccourcit.
pub fn texte_simple(brut: &str, max: usize) -> String {
    let mut sortie = String::with_capacity(brut.len().min(max + 8));
    let mut dans_img = false;
    let mut reste = brut;
    while let Some(c) = reste.chars().next() {
        if c == '[' {
            let fin = reste.find(']').unwrap_or(reste.len() - 1);
            let balise = reste[1..fin].to_ascii_lowercase();
            if balise == "img" || balise.starts_with("previewyoutube") {
                dans_img = true;
            } else if balise == "/img" || balise == "/previewyoutube" {
                dans_img = false;
            }
            reste = &reste[fin + 1..];
            continue;
        }
        if !dans_img {
            sortie.push(c);
        }
        reste = &reste[c.len_utf8()..];
    }
    let propre = sortie.split_whitespace().collect::<Vec<_>>().join(" ");
    if propre.chars().count() > max {
        let coupe: String = propre.chars().take(max).collect();
        format!("{}…", coupe.trim_end())
    } else {
        propre
    }
}

/// Un objet tel que renvoyé par `QueryFiles` ou `GetPublishedFileDetails`.
pub fn objet_depuis(v: &Value) -> Option<ObjetWorkshop> {
    let id = v["publishedfileid"].as_str().map(str::to_owned).or_else(|| v["publishedfileid"].as_u64().map(|n| n.to_string()))?;
    // `result` ≠ 1 : objet supprimé ou caché.
    if v.get("result").is_some_and(|r| nombre(r) != 1) {
        return None;
    }
    let titre = v["title"].as_str().unwrap_or_default().trim().to_string();
    let description = v["short_description"].as_str().or(v["file_description"].as_str()).or(v["description"].as_str()).unwrap_or_default();
    let votes = &v["vote_data"];
    let tags = v["tags"]
        .as_array()
        .map(|l| l.iter().filter_map(|t| t["display_name"].as_str().or(t["tag"].as_str()).map(str::to_owned)).collect())
        .unwrap_or_default();
    Some(ObjetWorkshop {
        id,
        app_id: nombre(if v["consumer_appid"].is_null() { &v["consumer_app_id"] } else { &v["consumer_appid"] }) as u32,
        titre,
        apercu: v["preview_url"].as_str().unwrap_or_default().to_string(),
        description: texte_simple(description, 420),
        taille: nombre(&v["file_size"]),
        maj: nombre(&v["time_updated"]) as i64,
        abonnes: nombre(&v["subscriptions"]),
        favoris: nombre(&v["favorited"]),
        vues: nombre(&v["views"]),
        note: votes["score"].as_f64(),
        votes: votes.get("votes_up").map(|u| nombre(u) + nombre(&votes["votes_down"])),
        tags,
        video: v["youtubevideoid"].as_str().filter(|y| !y.is_empty() && y.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')).map(str::to_owned),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageWorkshop {
    pub total: u64,
    pub objets: Vec<ObjetWorkshop>,
}

/// Tri de la vitrine → `query_type` de `QueryFiles`.
pub fn type_requete(tri: &str, recherche: bool) -> &'static str {
    if recherche {
        return "12"; // par pertinence du texte
    }
    match tri {
        "recents" => "1",
        "tendance" => "3",
        "abonnes" => "9",
        _ => "0", // les mieux notés
    }
}

/// Type de contenu → `filetype` de `QueryFiles` (EPublishedFileInfoMatchingFileType).
pub fn type_fichier(genre: &str) -> &'static str {
    match genre {
        "illustrations" => "2",
        "videos" => "3",
        "captures" => "4",
        "guides" => "10",
        _ => "0", // objets (mods)
    }
}

const API: &str = "https://api.steampowered.com";

/// Détails publics de plusieurs objets (sans clé), par paquets de 100.
pub async fn details(client: &super::webapi::ClientSteam, ids: &[String]) -> crate::erreur::Resultat<Vec<ObjetWorkshop>> {
    let mut objets = Vec::new();
    for paquet in ids.chunks(100) {
        let mut form: Vec<(String, String)> = vec![("itemcount".into(), paquet.len().to_string())];
        for (i, id) in paquet.iter().enumerate() {
            form.push((format!("publishedfileids[{i}]"), id.clone()));
        }
        let corps_form: String = url::form_urlencoded::Serializer::new(String::new()).extend_pairs(&form).finish();
        let rep = client
            .http
            .post(format!("{API}/ISteamRemoteStorage/GetPublishedFileDetails/v1/"))
            .header("content-type", "application/x-www-form-urlencoded")
            .body(corps_form)
            .send()
            .await
            .map_err(|e| crate::erreur::Erreur::from(e.without_url()))?;
        if !rep.status().is_success() {
            return Err(crate::erreur::Erreur::Steam(format!("HTTP {}", rep.status().as_u16())));
        }
        let corps: Value = rep.json().await.map_err(|e| crate::erreur::Erreur::from(e.without_url()))?;
        if let Some(liste) = corps["response"]["publishedfiledetails"].as_array() {
            objets.extend(liste.iter().filter_map(objet_depuis));
        }
    }
    Ok(objets)
}

/// Vitrine du Workshop d'un jeu (`QueryFiles`), 30 objets par page.
pub async fn vitrine(
    client: &super::webapi::ClientSteam,
    cle: &str,
    app_id: u32,
    tri: &str,
    genre: &str,
    recherche: &str,
    page: u32,
) -> crate::erreur::Resultat<PageWorkshop> {
    let app = app_id.to_string();
    let page = page.max(1).to_string();
    let mut params: Vec<(&str, &str)> = vec![
        ("key", cle),
        ("query_type", type_requete(tri, !recherche.is_empty())),
        ("page", &page),
        ("numperpage", "30"),
        ("appid", &app),
        ("filetype", type_fichier(genre)),
        ("return_vote_data", "true"),
        ("return_tags", "true"),
        ("return_short_description", "true"),
        ("strip_description_bbcode", "true"),
    ];
    // Les mods sont créés par le jeu lui-même ; illustrations, captures et guides
    // viennent du site ou du client Steam, donc pas de filtre de créateur pour eux.
    if genre == "objets" {
        params.push(("creator_appid", &app));
    }
    if !recherche.is_empty() {
        params.push(("search_text", recherche));
    }
    if tri == "tendance" && recherche.is_empty() {
        params.push(("days", "7"));
    }
    let url = url::Url::parse_with_params(&format!("{API}/IPublishedFileService/QueryFiles/v1/"), &params)
        .map_err(|_| crate::erreur::Erreur::Interne("URL".into()))?;
    let corps: Value = client.obtenir(url).await?;
    let r = &corps["response"];
    Ok(PageWorkshop {
        total: nombre(&r["total"]),
        objets: r["publishedfiledetails"].as_array().map(|l| l.iter().filter_map(objet_depuis).collect()).unwrap_or_default(),
    })
}

// ——— Captures d'écran ———

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Capture {
    /// Chemin relatif à `remote/` : `<appid>/screenshots/<fichier>.jpg`.
    pub fichier: String,
    pub miniature: String,
    pub largeur: u32,
    pub hauteur: u32,
    /// Secondes depuis 1970.
    pub date: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturesJeu {
    pub app_id: u32,
    pub captures: Vec<Capture>,
}

/// Dossier `760/remote` du compte, où Steam range les captures.
pub fn dossier_captures(steam: &Path, compte: u32) -> PathBuf {
    steam.join("userdata").join(compte.to_string()).join("760").join("remote")
}

/// Un chemin de capture est sûr : `<chiffres>/screenshots/[thumbnails/]<nom>.jpg`,
/// sans `..` ni séparateur Windows.
pub fn chemin_capture_valide(chemin: &str) -> bool {
    let parties: Vec<&str> = chemin.split('/').collect();
    let nom_ok = |n: &str| {
        n.len() > 4 && n.ends_with(".jpg") && n[..n.len() - 4].bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    };
    match parties.as_slice() {
        [app, "screenshots", nom] => app.bytes().all(|b| b.is_ascii_digit()) && !app.is_empty() && nom_ok(nom),
        [app, "screenshots", "thumbnails", nom] => app.bytes().all(|b| b.is_ascii_digit()) && !app.is_empty() && nom_ok(nom),
        _ => false,
    }
}

/// Lit `screenshots.vdf` et garde les captures dont le fichier existe encore.
pub fn lire_captures(texte: &str, remote: Option<&Path>) -> Vec<CapturesJeu> {
    let racine = vdf::lire(texte);
    let mut par_jeu: HashMap<u32, Vec<Capture>> = HashMap::new();
    for (app, liste) in racine.get("screenshots").map(Vdf::paires).unwrap_or_default() {
        let Ok(app_id) = app.parse::<u32>() else { continue };
        for (_, c) in liste.paires() {
            let (Some(fichier), Some(miniature)) = (c.texte("filename"), c.texte("thumbnail")) else { continue };
            let (fichier, miniature) = (fichier.replace('\\', "/"), miniature.replace('\\', "/"));
            if !chemin_capture_valide(&fichier) || !chemin_capture_valide(&miniature) {
                continue;
            }
            if let Some(r) = remote {
                if !r.join(&fichier).is_file() {
                    continue;
                }
            }
            par_jeu.entry(app_id).or_default().push(Capture {
                fichier,
                miniature,
                largeur: c.nombre("width").unwrap_or(0),
                hauteur: c.nombre("height").unwrap_or(0),
                date: c.nombre("creation").unwrap_or(0),
            });
        }
    }
    let mut jeux: Vec<CapturesJeu> = par_jeu
        .into_iter()
        .map(|(app_id, mut captures)| {
            captures.sort_by(|a, b| b.date.cmp(&a.date));
            CapturesJeu { app_id, captures }
        })
        .collect();
    // Le jeu avec la capture la plus récente d'abord.
    jeux.sort_by(|a, b| b.captures[0].date.cmp(&a.captures[0].date));
    jeux
}

pub fn captures(steam: &Path, compte: u32) -> Vec<CapturesJeu> {
    let base = steam.join("userdata").join(compte.to_string()).join("760");
    let remote = base.join("remote");
    match std::fs::read_to_string(base.join("screenshots.vdf")) {
        Ok(t) => lire_captures(&t, Some(&remote)),
        Err(_) => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ACF: &str = r#""AppWorkshop"
{
	"appid"		"431960"
	"SizeOnDisk"		"500"
	"WorkshopItemsInstalled"
	{
		"111"
		{
			"size"		"100"
			"timeupdated"		"1700000000"
			"manifest"		"1"
		}
		"222"
		{
			"size"		"300"
			"timeupdated"		"1800000000"
			"manifest"		"2"
		}
		"333"
		{
			"size"		"50"
			"timeupdated"		"1600000000"
			"manifest"		"3"
		}
	}
	"WorkshopItemDetails"
	{
		"111"
		{
			"manifest"		"1"
			"subscribedby"		"42"
			"latest_manifest"		"1"
		}
		"222"
		{
			"manifest"		"2"
			"subscribedby"		"42"
			"latest_manifest"		"9"
		}
		"333"
		{
			"manifest"		"3"
			"subscribedby"		"77"
		}
	}
}"#;

    #[test]
    fn mods_du_compte_seulement() {
        let j = lire_appworkshop(ACF, 42).unwrap();
        assert_eq!(j.app_id, 431960);
        assert_eq!(j.mods.len(), 2);
        assert_eq!(j.mods[0].id, "222"); // le plus récent d'abord
        assert!(j.mods[0].a_mettre_a_jour);
        assert!(!j.mods[1].a_mettre_a_jour);
        assert_eq!(j.taille, 400);
        assert!(lire_appworkshop(ACF, 5).is_none());
    }

    #[test]
    fn numero_de_compte() {
        assert_eq!(numero_compte("76561197960265770"), Some(42));
        assert_eq!(numero_compte("abc"), None);
        assert_eq!(numero_compte("1"), None);
    }

    #[test]
    fn chemins_de_captures() {
        assert!(chemin_capture_valide("990080/screenshots/20250910144328_1.jpg"));
        assert!(chemin_capture_valide("990080/screenshots/thumbnails/20250910144328_1.jpg"));
        assert!(!chemin_capture_valide("../990080/screenshots/a.jpg"));
        assert!(!chemin_capture_valide("990080/screenshots/../../a.jpg"));
        assert!(!chemin_capture_valide("990080/screenshots/a.exe"));
        assert!(!chemin_capture_valide("990080\\screenshots\\a.jpg"));
        assert!(!chemin_capture_valide("abc/screenshots/a.jpg"));
    }

    #[test]
    fn captures_triees() {
        let vdf = r#""screenshots"
{
	"10"
	{
		"0"
		{
			"filename"		"10/screenshots/a_1.jpg"
			"thumbnail"		"10/screenshots/thumbnails/a_1.jpg"
			"width"		"1920"
			"height"		"1080"
			"creation"		"100"
		}
	}
	"20"
	{
		"0"
		{
			"filename"		"20/screenshots/b_1.jpg"
			"thumbnail"		"20/screenshots/thumbnails/b_1.jpg"
			"creation"		"300"
		}
		"1"
		{
			"filename"		"..\\..\\x.jpg"
			"thumbnail"		"x.jpg"
			"creation"		"999"
		}
	}
}"#;
        let j = lire_captures(vdf, None);
        assert_eq!(j.len(), 2);
        assert_eq!(j[0].app_id, 20);
        assert_eq!(j[0].captures.len(), 1);
        assert_eq!(j[1].captures[0].largeur, 1920);
    }

    #[test]
    fn objet_de_query_files() {
        let v: Value = serde_json::json!({
            "publishedfileid": "123", "consumer_appid": 431960, "title": " Lune ",
            "preview_url": "https://images.steamusercontent.com/ugc/1/a.gif",
            "short_description": "[b]Belle[/b] lune [img]https://x/y.png[/img] la nuit",
            "file_size": "2048", "time_updated": 1700000000, "subscriptions": 10, "favorited": 2, "views": 99,
            "tags": [{"tag": "Anime", "display_name": "Anime"}],
            "vote_data": {"score": 0.9, "votes_up": 9, "votes_down": 1}
        });
        let o = objet_depuis(&v).unwrap();
        assert_eq!(o.titre, "Lune");
        assert_eq!(o.description, "Belle lune la nuit");
        assert_eq!(o.taille, 2048);
        assert_eq!(o.votes, Some(10));
        assert_eq!(o.tags, vec!["Anime"]);
        assert!(objet_depuis(&serde_json::json!({"publishedfileid": "1", "result": 9})).is_none());
    }
}

/// Essai réel, lancé à la main : `RESTEAM_COMPTE=<numéro> cargo test --lib essai_reel -- --ignored --nocapture`.
/// N'affiche jamais la clé.
#[cfg(test)]
mod essai_reel {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn essai_reel() {
        let compte: u32 = std::env::var("RESTEAM_COMPTE").unwrap().parse().unwrap();
        let steam = local::dossier_steam().unwrap();
        let jeux = mods_installes(&steam, compte);
        for j in &jeux {
            println!("jeu {} : {} mods, {} Mo", j.app_id, j.mods.len(), j.taille / 1_048_576);
        }
        let caps = captures(&steam, compte);
        println!("captures : {} jeux, {} images", caps.len(), caps.iter().map(|c| c.captures.len()).sum::<usize>());
        let client = crate::steam::webapi::ClientSteam::nouveau().unwrap();
        let ids: Vec<String> = jeux[0].mods.iter().take(3).map(|m| m.id.clone()).collect();
        for o in details(&client, &ids).await.unwrap() {
            println!("détail : {} | {} | {} abonnés | apercu {}", o.id, o.titre, o.abonnes, &o.apercu[..o.apercu.len().min(50)]);
        }
        let cle = crate::secrets::lire().unwrap().unwrap();
        for (tri, genre) in [("populaires", "objets"), ("tendance", "objets"), ("populaires", "illustrations"), ("populaires", "guides"), ("populaires", "captures"), ("populaires", "videos")] {
            let app: u32 = std::env::var("RESTEAM_APP").ok().and_then(|a| a.parse().ok()).unwrap_or(jeux[0].app_id);
            match vitrine(&client, &cle, app, tri, genre, "", 1).await {
                Ok(p) => println!("vitrine {tri}/{genre} : total {}, {} objets, 1er : {:?} note {:?}", p.total, p.objets.len(), p.objets.first().map(|o| &o.titre), p.objets.first().and_then(|o| o.note)),
                Err(e) => println!("vitrine {tri}/{genre} : erreur {e}"),
            }
        }
        let p = vitrine(&client, &cle, jeux[0].app_id, "populaires", "objets", "moon", 1).await.unwrap();
        println!("recherche moon : total {}, 1er {:?}", p.total, p.objets.first().map(|o| &o.titre));
    }
}
