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

/// Pas des jeux : 241100 = configurations de manette de Steam Input (sans image,
/// titres en codes internes). Masqués du Workshop.
pub const HORS_WORKSHOP: [u32; 1] = [241100];

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
        let entrees: Vec<_> = entrees.flatten().collect();
        for e in entrees {
            let nom = e.file_name().to_string_lossy().into_owned();
            if !(nom.starts_with("appworkshop_") && nom.ends_with(".acf")) {
                continue;
            }
            let Ok(texte) = std::fs::read_to_string(e.path()) else { continue };
            if let Some(j) = lire_appworkshop(&texte, compte).filter(|j| !HORS_WORKSHOP.contains(&j.app_id)) {
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
    /// Images en grande taille ajoutées par l'auteur (souvent 1080p).
    #[serde(default)]
    pub galerie: Vec<String>,
    /// Vidéos YouTube de présentation.
    #[serde(default)]
    pub youtube: Vec<String>,
}

fn id_youtube(y: &str) -> bool {
    !y.is_empty() && y.len() <= 20 && y.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
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
    objet_depuis_max(v, 420)
}

pub fn objet_depuis_max(v: &Value, max_description: usize) -> Option<ObjetWorkshop> {
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
        description: texte_simple(description, max_description),
        taille: nombre(&v["file_size"]),
        maj: nombre(&v["time_updated"]) as i64,
        abonnes: nombre(&v["subscriptions"]),
        favoris: nombre(&v["favorited"]),
        vues: nombre(&v["views"]),
        note: votes["score"].as_f64(),
        votes: votes.get("votes_up").map(|u| nombre(u) + nombre(&votes["votes_down"])),
        tags,
        video: v["youtubevideoid"].as_str().filter(|y| id_youtube(y)).map(str::to_owned),
        galerie: v["previews"]
            .as_array()
            .map(|l| {
                l.iter()
                    .filter(|p| nombre(&p["preview_type"]) == 0)
                    .filter_map(|p| p["url"].as_str().filter(|u| u.starts_with("https://")).map(str::to_owned))
                    .collect()
            })
            .unwrap_or_default(),
        youtube: v["previews"]
            .as_array()
            .map(|l| {
                l.iter()
                    .filter(|p| nombre(&p["preview_type"]) == 1)
                    .filter_map(|p| p["youtubevideoid"].as_str().filter(|y| id_youtube(y)).map(str::to_owned))
                    .collect()
            })
            .unwrap_or_default(),
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
        ("return_previews", "true"),
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

/// Fiche complète d'un objet (`IPublishedFileService/GetDetails`) : galerie,
/// vidéos, avis et description longue.
pub async fn fiche(client: &super::webapi::ClientSteam, cle: &str, id: &str) -> crate::erreur::Resultat<Option<ObjetWorkshop>> {
    let url = url::Url::parse_with_params(
        &format!("{API}/IPublishedFileService/GetDetails/v1/"),
        &[
            ("key", cle),
            ("publishedfileids[0]", id),
            ("includeadditionalpreviews", "true"),
            ("includevotes", "true"),
            ("includetags", "true"),
            ("strip_description_bbcode", "true"),
        ],
    )
    .map_err(|_| crate::erreur::Erreur::Interne("URL".into()))?;
    let corps: Value = client.obtenir(url).await?;
    Ok(corps["response"]["publishedfiledetails"].as_array().and_then(|l| l.first()).and_then(|v| objet_depuis_max(v, 1500)))
}

// ——— Fichiers installés d'un objet (lecture locale en pleine qualité) ———

/// Dossiers `steamapps/workshop/content` de toutes les bibliothèques.
pub fn dossiers_contenu(steam: &Path) -> Vec<PathBuf> {
    local::dossiers_bibliotheque(steam)
        .into_iter()
        .map(|b| Path::new(&b.chemin).join("steamapps").join("workshop").join("content"))
        .filter(|d| d.is_dir())
        .collect()
}

/// Un nom de fichier sûr : un seul élément de chemin, sans `..` ni lecteur.
pub fn nom_fichier_valide(nom: &str) -> bool {
    !nom.is_empty() && nom.len() <= 200 && !nom.starts_with('.') && !nom.contains(['/', '\\', ':', '\0']) && nom != ".."
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MediaLocal {
    /// Vidéo du fond (Wallpaper Engine, type « video », ou vidéo d'une scène), en pleine qualité.
    pub video: Option<String>,
    /// Illustration en haute définition d'un fond « scène » (tirée de `scene.pkg`).
    #[serde(default)]
    pub image_hd: Option<String>,
    /// Image d'aperçu sur le disque.
    pub image: Option<String>,
}

fn adresse_locale(app_id: u32, id: &str, nom: &str) -> String {
    let code = percent_encoding::utf8_percent_encode(nom, percent_encoding::NON_ALPHANUMERIC);
    format!("http://img.localhost/__workshop__/{app_id}/{id}/{code}")
}

/// Ce qu'on peut montrer en local pour un objet installé : la vidéo du fond si c'en
/// est une (`project.json` de Wallpaper Engine), sinon l'image d'aperçu.
pub fn media_local(steam: &Path, app_id: u32, id: &str) -> Option<MediaLocal> {
    if !id.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let dossier = dossiers_contenu(steam).into_iter().map(|d| d.join(app_id.to_string()).join(id)).find(|d| d.is_dir())?;
    let projet: Option<Value> = std::fs::read_to_string(dossier.join("project.json")).ok().and_then(|t| serde_json::from_str(&t).ok());
    let mut media = MediaLocal::default();
    if let Some(p) = &projet {
        if p["type"].as_str().is_some_and(|t| t.eq_ignore_ascii_case("video")) {
            if let Some(f) = p["file"].as_str().filter(|f| nom_fichier_valide(f) && dossier.join(f).is_file()) {
                media.video = Some(adresse_locale(app_id, id, f));
            }
        }
        if let Some(f) = p["preview"].as_str().filter(|f| nom_fichier_valide(f) && dossier.join(f).is_file()) {
            media.image = Some(adresse_locale(app_id, id, f));
        }
    }
    // Fond « scène » : l'aperçu n'est qu'un petit GIF (souvent 250×250). La plus grande
    // texture de `scene.pkg` contient souvent l'illustration (PNG, JPEG) ou une vidéo
    // (MP4) en pleine définition : on la montre telle quelle, servie sous `__scene__`.
    if media.video.is_none() {
        if let Some(m) = morceau_scene(&dossier.join("scene.pkg")) {
            let adresse = adresse_locale(app_id, id, NOM_SCENE);
            if m.video {
                media.video = Some(adresse);
            } else {
                media.image_hd = Some(adresse);
            }
        }
    }
    if media.image.is_none() {
        media.image = ["preview.jpg", "preview.png", "preview.gif"].iter().find(|f| dossier.join(f).is_file()).map(|f| adresse_locale(app_id, id, f));
    }
    (media.video.is_some() || media.image.is_some() || media.image_hd.is_some()).then_some(media)
}

/// Nom virtuel du média tiré de `scene.pkg` (jamais un vrai fichier lu par son nom).
pub const NOM_SCENE: &str = "__scene__";

/// Morceau de `scene.pkg` qui contient un fichier lisible tel quel.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MorceauScene {
    /// Position du fichier dans `scene.pkg`.
    pub debut: u64,
    pub longueur: u64,
    pub video: bool,
}

/// `scene.pkg` déjà examinés (chemin → date de modification, résultat).
static SCENES: std::sync::Mutex<Option<HashMap<PathBuf, (std::time::SystemTime, Option<MorceauScene>)>>> = std::sync::Mutex::new(None);

/// Média haute définition d'un `scene.pkg`, mis en cache tant que le fichier ne change pas.
pub fn morceau_scene(pkg: &Path) -> Option<MorceauScene> {
    let date = std::fs::metadata(pkg).and_then(|m| m.modified()).ok()?;
    if let Ok(g) = SCENES.lock() {
        if let Some((d, m)) = g.as_ref().and_then(|c| c.get(pkg)) {
            if *d == date {
                return *m;
            }
        }
    }
    let m = std::fs::File::open(pkg).ok().and_then(|f| lire_scene(std::io::BufReader::new(f)));
    if let Ok(mut g) = SCENES.lock() {
        g.get_or_insert_with(HashMap::new).insert(pkg.to_path_buf(), (date, m));
    }
    m
}

/// Lit la table de `scene.pkg` (`PKGV…`, puis nom, position, taille de chaque fichier)
/// et cherche, dans les textures (`.tex`), un fichier PNG, JPEG ou MP4 rangé tel quel
/// (précédé de sa taille sur 4 octets). Vidéo d'abord, sinon la plus grande image.
/// Tout est borné : une table piégée ne fait ni lire ni allouer n'importe quoi.
pub fn lire_scene<R: std::io::Read + std::io::Seek>(mut r: R) -> Option<MorceauScene> {
    use std::io::SeekFrom;
    let u32_ = |r: &mut R| -> Option<u32> {
        let mut b = [0u8; 4];
        r.read_exact(&mut b).ok()?;
        Some(u32::from_le_bytes(b))
    };
    let n = u32_(&mut r)? as usize;
    if !(4..=32).contains(&n) {
        return None;
    }
    let mut version = vec![0u8; n];
    r.read_exact(&mut version).ok()?;
    if !version.starts_with(b"PKGV") {
        return None;
    }
    let nombre = u32_(&mut r)?;
    if nombre > 20_000 {
        return None;
    }
    let mut entrees = Vec::new();
    for _ in 0..nombre {
        let ln = u32_(&mut r)? as usize;
        if ln > 1024 {
            return None;
        }
        let mut nom = vec![0u8; ln];
        r.read_exact(&mut nom).ok()?;
        let (pos, taille) = (u32_(&mut r)? as u64, u32_(&mut r)? as u64);
        entrees.push((String::from_utf8_lossy(&nom).to_lowercase(), pos, taille));
    }
    let base = r.stream_position().ok()?;
    let mut meilleur: Option<MorceauScene> = None;
    for (nom, pos, taille) in entrees {
        let ecarte = ["depth", "mask", "particle", "noise", "normal"].iter().any(|m| nom.contains(m));
        if !nom.ends_with(".tex") || ecarte || taille < 100_000 {
            continue;
        }
        r.seek(SeekFrom::Start(base + pos)).ok()?;
        let mut tete = vec![0u8; taille.min(4096) as usize];
        if r.read_exact(&mut tete).is_err() || !tete.starts_with(b"TEXV") {
            continue;
        }
        let Some((debut, video)) = signature(&tete) else { continue };
        if debut < 4 {
            continue;
        }
        let longueur = u32::from_le_bytes(tete[debut - 4..debut].try_into().ok()?) as u64;
        if longueur < 50_000 || debut as u64 + longueur > taille {
            continue;
        }
        // Une image n'est retenue que si elle a le format d'un écran : les auteurs rangent
        // aussi dans le paquet des affiches (dons, codes QR) qui ne sont pas le fond.
        if !video && !format_ecran(dimensions_image(&tete[debut..])) {
            continue;
        }
        let m = MorceauScene { debut: base + pos + debut as u64, longueur, video };
        let mieux = match meilleur {
            None => true,
            Some(b) => (m.video && !b.video) || (m.video == b.video && m.longueur > b.longueur),
        };
        if mieux {
            meilleur = Some(m);
        }
    }
    meilleur
}

/// Paysage d'au moins 1600 px de large, entre 4:3 et 21:9 : le format d'un fond d'écran.
fn format_ecran(d: Option<(u32, u32)>) -> bool {
    d.is_some_and(|(l, h)| l >= 1600 && h > 0 && (1.3..=2.45).contains(&(l as f64 / h as f64)))
}

/// Largeur et hauteur d'une image PNG (bloc IHDR) ou JPEG (marqueur SOF), d'après ses premiers octets.
fn dimensions_image(o: &[u8]) -> Option<(u32, u32)> {
    if o.starts_with(b"\x89PNG") {
        let l = u32::from_be_bytes(o.get(16..20)?.try_into().ok()?);
        let h = u32::from_be_bytes(o.get(20..24)?.try_into().ok()?);
        return Some((l, h));
    }
    // JPEG : on suit les segments jusqu'au premier SOF (C0 à CF, sauf C4, C8 et CC).
    let mut i = 2;
    while i + 9 < o.len() {
        if o[i] != 0xFF {
            return None;
        }
        let m = o[i + 1];
        let longueur = u16::from_be_bytes([o[i + 2], o[i + 3]]) as usize;
        if (0xC0..=0xCF).contains(&m) && ![0xC4, 0xC8, 0xCC].contains(&m) {
            let h = u16::from_be_bytes([o[i + 5], o[i + 6]]) as u32;
            let l = u16::from_be_bytes([o[i + 7], o[i + 8]]) as u32;
            return Some((l, h));
        }
        i += 2 + longueur;
    }
    None
}

/// Début d'un fichier PNG, JPEG ou MP4 dans l'en-tête d'une texture, et s'il s'agit d'une vidéo.
fn signature(t: &[u8]) -> Option<(usize, bool)> {
    let chercher = |motif: &[u8]| t.windows(motif.len()).position(|w| w == motif);
    if let Some(i) = chercher(b"ftyp").filter(|i| *i >= 8) {
        return Some((i - 4, true));
    }
    chercher(b"\x89PNG\r\n\x1a\n").or_else(|| chercher(&[0xFF, 0xD8, 0xFF])).map(|i| (i, false))
}

/// Type d'un fichier servi : par l'extension, sinon par ses premiers octets
/// (les vidéos de Wallpaper Engine n'ont parfois pas d'extension).
pub fn type_media(nom: &str, debut: &[u8]) -> &'static str {
    let ext = nom.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()).unwrap_or_default();
    match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        _ if debut.len() >= 12 && &debut[4..8] == b"ftyp" => "video/mp4",
        _ if debut.starts_with(&[0x1A, 0x45, 0xDF, 0xA3]) => "video/webm",
        _ if debut.starts_with(&[0xFF, 0xD8, 0xFF]) => "image/jpeg",
        _ if debut.starts_with(b"\x89PNG") => "image/png",
        _ if debut.starts_with(b"GIF8") => "image/gif",
        _ => "application/octet-stream",
    }
}

// ——— Suivi d'un téléchargement ———

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EtatMod {
    /// Présent dans les mods installés du compte.
    pub installe: bool,
    /// Octets déjà reçus par Steam (dossier de téléchargement du Workshop).
    pub recu: u64,
}

fn taille_dossier(d: &Path) -> u64 {
    let Ok(entrees) = std::fs::read_dir(d) else { return 0 };
    entrees
        .flatten()
        .map(|e| match e.file_type() {
            Ok(t) if t.is_dir() => taille_dossier(&e.path()),
            Ok(_) => e.metadata().map(|m| m.len()).unwrap_or(0),
            Err(_) => 0,
        })
        .sum()
}

pub fn etat_mod(steam: &Path, compte: u32, app_id: u32, id: &str) -> EtatMod {
    let installe = mods_installes(steam, compte).iter().any(|j| j.app_id == app_id && j.mods.iter().any(|m| m.id == id));
    let mut recu = 0;
    if !installe {
        for b in local::dossiers_bibliotheque(steam) {
            let w = Path::new(&b.chemin).join("steamapps").join("workshop");
            recu = recu.max(taille_dossier(&w.join("downloads").join(app_id.to_string()).join(id)));
            recu = recu.max(taille_dossier(&w.join("content").join(app_id.to_string()).join(id)));
        }
    }
    EtatMod { installe, recu }
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
mod tests_scene {
    use super::*;
    use std::io::Cursor;

    /// `scene.pkg` minimal : table, puis une texture qui contient `contenu` (avec sa taille devant).
    fn paquet(textures: &[(&str, Vec<u8>)]) -> Vec<u8> {
        let mut donnees = Vec::new();
        let mut table = Vec::new();
        for (nom, contenu) in textures {
            let mut tex = b"TEXV0005\0TEXI0001\0".to_vec();
            tex.extend_from_slice(&[0u8; 40]);
            tex.extend_from_slice(&(contenu.len() as u32).to_le_bytes());
            tex.extend_from_slice(contenu);
            table.extend_from_slice(&(nom.len() as u32).to_le_bytes());
            table.extend_from_slice(nom.as_bytes());
            table.extend_from_slice(&(donnees.len() as u32).to_le_bytes());
            table.extend_from_slice(&(tex.len() as u32).to_le_bytes());
            donnees.extend_from_slice(&tex);
        }
        let mut p = 8u32.to_le_bytes().to_vec();
        p.extend_from_slice(b"PKGV0024");
        p.extend_from_slice(&(textures.len() as u32).to_le_bytes());
        p.extend_from_slice(&table);
        p.extend_from_slice(&donnees);
        p
    }

    fn png_de(taille: usize, l: u32, h: u32) -> Vec<u8> {
        let mut v = b"\x89PNG\r\n\x1a\n\0\0\0\x0dIHDR".to_vec();
        v.extend_from_slice(&l.to_be_bytes());
        v.extend_from_slice(&h.to_be_bytes());
        v.resize(taille, 7);
        v
    }

    fn png(taille: usize) -> Vec<u8> {
        png_de(taille, 3840, 2160)
    }

    #[test]
    fn affiche_portrait_ecartee() {
        // L'affiche de dons (portrait, plus grande) est écartée au profit du fond paysage.
        let p = paquet(&[("materials/dons.tex", png_de(300_000, 3157, 3516)), ("materials/fond.tex", png(150_000))]);
        assert_eq!(lire_scene(Cursor::new(&p)).map(|m| m.longueur), Some(150_000));
        let p = paquet(&[("materials/dons.tex", png_de(300_000, 3157, 3516))]);
        assert_eq!(lire_scene(Cursor::new(&p)), None);
        // JPEG : dimensions lues dans le marqueur SOF0.
        let jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 0, 4, 0, 0, 0xFF, 0xC0, 0, 17, 8, 0x04, 0x38, 0x07, 0x80, 3, 0, 0];
        assert_eq!(dimensions_image(&jpeg), Some((1920, 1080)));
        assert!(format_ecran(Some((1920, 1080))) && !format_ecran(Some((1080, 1920))) && !format_ecran(Some((800, 450))));
    }

    #[test]
    fn image_puis_video() {
        let p = paquet(&[("materials/fond.tex", png(150_000)), ("materials/petit.tex", png(120_000))]);
        let m = lire_scene(Cursor::new(&p)).unwrap();
        assert!(!m.video);
        assert_eq!(m.longueur, 150_000);
        assert_eq!(&p[m.debut as usize..m.debut as usize + 4], b"\x89PNG");
        // Une vidéo passe devant une image plus grande.
        let mut mp4 = vec![0, 0, 0, 0x20];
        mp4.extend_from_slice(b"ftypisom");
        mp4.resize(110_000, 1);
        let p = paquet(&[("materials/fond.tex", png(150_000)), ("materials/anim.tex", mp4)]);
        let m = lire_scene(Cursor::new(&p)).unwrap();
        assert!(m.video && m.longueur == 110_000);
    }

    #[test]
    fn rien_de_lisible_ou_piege() {
        // Profondeur et masques écartés, texture compressée (sans signature) ignorée.
        let p = paquet(&[("materials/fond_depth.tex", png(150_000)), ("materials/x.tex", vec![9u8; 150_000])]);
        assert_eq!(lire_scene(Cursor::new(&p)), None);
        // Taille annoncée plus grande que la texture : refusée.
        let mut p = paquet(&[("materials/fond.tex", png(150_000))]);
        let i = p.windows(4).position(|w| w == b"\x89PNG").unwrap();
        p[i - 4..i].copy_from_slice(&u32::MAX.to_le_bytes());
        assert_eq!(lire_scene(Cursor::new(&p)), None);
        // En-têtes absurdes ou tronqués.
        assert_eq!(lire_scene(Cursor::new(b"\xff\xff\xff\xffPKGV")), None);
        assert_eq!(lire_scene(Cursor::new(Vec::<u8>::new())), None);
        let mut p = 8u32.to_le_bytes().to_vec();
        p.extend_from_slice(b"PKGV0024");
        p.extend_from_slice(&u32::MAX.to_le_bytes());
        assert_eq!(lire_scene(Cursor::new(&p)), None);
    }

    /// Lecture seule des fonds « scène » installés sur ce PC.
    #[test]
    #[ignore = "lit les fonds Wallpaper Engine de ce PC"]
    fn scenes_de_ce_pc() {
        let steam = local::dossier_steam().unwrap();
        for id in ["3436945972", "3454792257"] {
            println!("{id} : {:?}", media_local(&steam, 431960, id));
        }
        // Bilan sur tous les fonds « scène » installés.
        let (mut total, mut video, mut image) = (0, 0, 0);
        for d in dossiers_contenu(&steam) {
            let Ok(l) = std::fs::read_dir(d.join("431960")) else { continue };
            for e in l.flatten() {
                let pkg = e.path().join("scene.pkg");
                if pkg.is_file() {
                    total += 1;
                    match morceau_scene(&pkg) {
                        Some(m) if m.video => video += 1,
                        Some(_) => image += 1,
                        None => {}
                    }
                }
            }
        }
        println!("scènes : {total}, vidéo HD : {video}, image HD : {image}");
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
    fn noms_et_types_locaux() {
        assert!(nom_fichier_valide("4K"));
        assert!(nom_fichier_valide("preview.jpg"));
        assert!(!nom_fichier_valide("../x.mp4"));
        assert!(!nom_fichier_valide("a/b.mp4"));
        assert!(!nom_fichier_valide("a\\b.mp4"));
        assert!(!nom_fichier_valide("C:x"));
        assert_eq!(type_media("4K", b"\0\0\0\x20ftypisom"), "video/mp4");
        assert_eq!(type_media("fond.WEBM", b""), "video/webm");
        assert_eq!(type_media("x", b"GIF89a"), "image/gif");
    }

    #[test]
    fn galerie_et_youtube() {
        let v: Value = serde_json::json!({
            "publishedfileid": "9", "title": "A",
            "previews": [
                {"preview_type": 0, "url": "https://images.steamusercontent.com/ugc/1/HD/"},
                {"preview_type": 1, "youtubevideoid": "dxy1pQRu9Po"},
                {"preview_type": 1, "youtubevideoid": "pas bon !"}
            ]
        });
        let o = objet_depuis(&v).unwrap();
        assert_eq!(o.galerie, vec!["https://images.steamusercontent.com/ugc/1/HD/"]);
        assert_eq!(o.youtube, vec!["dxy1pQRu9Po"]);
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
        println!("média 1309372573 : {:?}", media_local(&steam, 431960, "1309372573"));
        println!("média 1055818964 : {:?}", media_local(&steam, 431960, "1055818964"));
        println!("état 3769706782 : {:?}", etat_mod(&steam, compte, 431960, "3769706782"));
        println!("jeux sans 241100 : {:?}", mods_installes(&steam, compte).iter().map(|j| j.app_id).collect::<Vec<_>>());
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
