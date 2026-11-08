//! Magasin (étape 5) : fiche d'un jeu (`appdetails`), avis (`GetItems`, l'ancienne
//! route `appreviews` renvoie maintenant vers l'accueil du magasin) et vitrine
//! (`featuredcategories` : offres, meilleures ventes, nouveautés). Tout est sans clé.

use serde::{Deserialize, Serialize};
use url::Url;

use super::notes::decoder_entites;
use super::webapi::ClientSteam;
use crate::erreur::{Erreur, Resultat};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Prix {
    /// Centimes.
    pub initial: u64,
    pub final_: u64,
    pub reduction: u32,
    /// « 19,57 € ».
    pub texte_initial: String,
    pub texte_final: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Media {
    pub video: bool,
    pub nom: String,
    pub miniature: String,
    /// Image 1920×1080, ou flux HLS de la bande-annonce.
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LigneConfig {
    /// « Processeur » (vide pour une remarque sans libellé).
    pub cle: String,
    pub valeur: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FicheJeu {
    pub app_id: u32,
    pub nom: String,
    pub gratuit: bool,
    pub resume: String,
    /// « À propos » en paragraphes de texte brut.
    pub a_propos: Vec<String>,
    pub genres: Vec<String>,
    pub developpeurs: Vec<String>,
    pub editeurs: Vec<String>,
    /// Date telle que l'écrit Steam (« 25 sept. 2025 »).
    pub sortie: String,
    pub a_venir: bool,
    pub langues: Vec<String>,
    pub prix: Option<Prix>,
    pub demo: bool,
    pub medias: Vec<Media>,
    pub config_minimale: Vec<LigneConfig>,
    pub config_recommandee: Vec<LigneConfig>,
    pub metacritic: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ResumeAvis {
    /// « Extrêmement positives ».
    pub libelle: String,
    pub pourcentage: u32,
    pub nombre: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct AvisJeu {
    pub global: Option<ResumeAvis>,
    /// Avis écrits en français.
    pub francais: Option<ResumeAvis>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OffreMagasin {
    pub app_id: u32,
    pub nom: String,
    pub reduction: u32,
    pub prix_initial: u64,
    pub prix_final: u64,
    pub devise: String,
    /// Capsule 616×353.
    pub image: Option<String>,
    /// Fin de l'offre (secondes depuis 1970), si connue.
    pub fin_offre: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct VitrineMagasin {
    pub offres: Vec<OffreMagasin>,
    pub meilleures_ventes: Vec<OffreMagasin>,
    pub nouveautes: Vec<OffreMagasin>,
}

// ——— Nettoyage du HTML de Steam ———

/// Retire les balises : `<br>`, `<li>`, `<p>` deviennent des retours à la ligne.
pub fn texte_brut(html: &str) -> String {
    let mut sortie = String::with_capacity(html.len());
    let mut reste = html;
    while let Some(i) = reste.find('<') {
        sortie.push_str(&reste[..i]);
        let Some(f) = reste[i..].find('>') else {
            reste = "";
            break;
        };
        let balise = reste[i + 1..i + f].trim_start_matches('/').to_ascii_lowercase();
        let nom: String = balise.chars().take_while(|c| c.is_ascii_alphanumeric()).collect();
        if matches!(nom.as_str(), "br" | "li" | "p" | "h1" | "h2" | "h3" | "ul" | "div") {
            sortie.push('\n');
        }
        reste = &reste[i + f + 1..];
    }
    sortie.push_str(reste);
    decoder_entites(&sortie).replace('\u{a0}', " ")
}

fn lignes(html: &str) -> Vec<String> {
    texte_brut(html)
        .lines()
        .map(|l| l.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|l| !l.is_empty())
        .collect()
}

/// Configuration (`<li><strong>Processeur :</strong> …</li>`) → lignes clé / valeur.
pub fn config(html: &str) -> Vec<LigneConfig> {
    lignes(html)
        .into_iter()
        .filter(|l| {
            let b = l.trim_end_matches(':').trim().to_lowercase();
            b != "minimale" && b != "recommandée" && b != "minimum" && b != "recommended"
        })
        .map(|l| match l.split_once(':') {
            Some((k, v)) if !v.trim().is_empty() && k.chars().count() <= 40 => {
                LigneConfig { cle: k.trim().to_string(), valeur: v.trim().to_string() }
            }
            _ => LigneConfig { cle: String::new(), valeur: l },
        })
        .collect()
}

/// « Anglais*, Français, … » → liste, sans les astérisques ni la note finale.
pub fn langues(html: &str) -> Vec<String> {
    let texte = texte_brut(html);
    let premiere = texte.lines().next().unwrap_or_default();
    premiere
        .split(',')
        .map(|l| l.replace('*', "").trim().to_string())
        .filter(|l| !l.is_empty())
        .collect()
}

fn texte_prix(centimes: u64) -> String {
    format!("{},{:02} €", centimes / 100, centimes % 100)
}

// ——— Réponses de Steam ———

#[derive(Deserialize)]
struct Nom {
    description: String,
}

#[derive(Deserialize)]
struct PrixBrut {
    #[serde(default)]
    initial: u64,
    #[serde(default, rename = "final")]
    final_: u64,
    #[serde(default)]
    discount_percent: u32,
}

#[derive(Deserialize)]
struct CaptureBrute {
    path_thumbnail: String,
    path_full: String,
}

#[derive(Deserialize)]
struct FilmBrut {
    #[serde(default)]
    name: String,
    #[serde(default)]
    thumbnail: String,
    hls_h264: Option<String>,
    mp4: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct SortieBrute {
    #[serde(default)]
    coming_soon: bool,
    #[serde(default)]
    date: String,
}

#[derive(Deserialize)]
struct FicheBrute {
    #[serde(default)]
    name: String,
    #[serde(default)]
    is_free: bool,
    #[serde(default)]
    short_description: String,
    #[serde(default)]
    about_the_game: String,
    #[serde(default)]
    supported_languages: String,
    #[serde(default)]
    developers: Vec<String>,
    #[serde(default)]
    publishers: Vec<String>,
    #[serde(default)]
    genres: Vec<Nom>,
    price_overview: Option<PrixBrut>,
    #[serde(default)]
    screenshots: Vec<CaptureBrute>,
    #[serde(default)]
    movies: Vec<FilmBrut>,
    pc_requirements: Option<serde_json::Value>,
    release_date: Option<SortieBrute>,
    demos: Option<serde_json::Value>,
    metacritic: Option<serde_json::Value>,
}

impl FicheBrute {
    fn vers_fiche(self, app_id: u32) -> FicheJeu {
        let req = self.pc_requirements.unwrap_or_default();
        let a_propos: Vec<String> = lignes(&self.about_the_game).into_iter().filter(|l| l.chars().count() > 2).collect();
        let mut medias: Vec<Media> = self
            .movies
            .into_iter()
            .filter_map(|m| {
                // Les anciennes bandes-annonces ont encore un MP4, les récentes seulement du HLS.
                let mp4 = m.mp4.as_ref().and_then(|v| v["max"].as_str().or(v["480"].as_str())).map(str::to_string);
                let url = mp4.or(m.hls_h264)?;
                Some(Media { video: true, nom: m.name, miniature: m.thumbnail, url })
            })
            .take(1)
            .collect();
        medias.extend(self.screenshots.into_iter().map(|c| Media {
            video: false,
            nom: String::new(),
            miniature: c.path_thumbnail,
            url: c.path_full,
        }));
        let sortie = self.release_date.unwrap_or(SortieBrute { coming_soon: false, date: String::new() });
        FicheJeu {
            app_id,
            nom: self.name,
            gratuit: self.is_free,
            resume: texte_brut(&self.short_description).trim().to_string(),
            a_propos,
            genres: self.genres.into_iter().map(|g| g.description).collect(),
            developpeurs: self.developers,
            editeurs: self.publishers,
            sortie: sortie.date,
            a_venir: sortie.coming_soon,
            langues: langues(&self.supported_languages),
            prix: self.price_overview.filter(|p| p.final_ > 0).map(|p| Prix {
                texte_initial: texte_prix(p.initial),
                texte_final: texte_prix(p.final_),
                initial: p.initial,
                final_: p.final_,
                reduction: p.discount_percent,
            }),
            demo: self.demos.as_ref().and_then(|d| d.as_array()).is_some_and(|d| !d.is_empty()),
            medias,
            config_minimale: req["minimum"].as_str().map(config).unwrap_or_default(),
            config_recommandee: req["recommended"].as_str().map(config).unwrap_or_default(),
            metacritic: self.metacritic.and_then(|m| m["score"].as_u64()).map(|s| s as u32),
        }
    }
}

#[derive(Deserialize)]
struct ElementVitrine {
    id: u32,
    #[serde(default, rename = "type")]
    genre: u32,
    #[serde(default)]
    name: String,
    #[serde(default)]
    discount_percent: u32,
    #[serde(default)]
    original_price: Option<u64>,
    #[serde(default)]
    final_price: u64,
    #[serde(default)]
    currency: String,
    large_capsule_image: Option<String>,
    discount_expiration: Option<i64>,
}

fn offres(v: &serde_json::Value, max: usize) -> Vec<OffreMagasin> {
    let items: Vec<ElementVitrine> = serde_json::from_value(v["items"].clone()).unwrap_or_default();
    let mut vus = std::collections::HashSet::new();
    items
        .into_iter()
        .filter(|e| e.genre == 0 && vus.insert(e.id))
        .take(max)
        .map(|e| OffreMagasin {
            app_id: e.id,
            nom: e.name,
            reduction: e.discount_percent,
            prix_initial: e.original_price.unwrap_or(e.final_price),
            prix_final: e.final_price,
            devise: e.currency,
            image: e.large_capsule_image,
            fin_offre: e.discount_expiration,
        })
        .collect()
}

fn resume_avis(v: &serde_json::Value) -> Option<ResumeAvis> {
    let nombre = v["review_count"].as_u64().filter(|n| *n > 0)?;
    let libelle = v["review_score_label"].as_str().unwrap_or_default();
    let mut c = libelle.chars();
    let libelle = c.next().map(|p| p.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default();
    Some(ResumeAvis { libelle, pourcentage: v["percent_positive"].as_u64().unwrap_or(0) as u32, nombre })
}

impl ClientSteam {
    /// Fiche complète d'un jeu (`appdetails`, en français, prix en euros).
    pub async fn fiche_jeu(&self, app_id: u32) -> Resultat<FicheJeu> {
        let app = app_id.to_string();
        let url = Url::parse_with_params(
            "https://store.steampowered.com/api/appdetails",
            &[("appids", app.as_str()), ("cc", "fr"), ("l", "french")],
        )
        .map_err(|_| Erreur::Interne("URL".into()))?;
        let mut corps: serde_json::Value = self.obtenir(url).await?;
        let entree = corps[app.as_str()].take();
        if entree["success"].as_bool() != Some(true) {
            return Err(Erreur::Steam("ce jeu n'a pas de page dans le magasin".into()));
        }
        let brute: FicheBrute =
            serde_json::from_value(entree["data"].clone()).map_err(|e| Erreur::Steam(format!("fiche illisible : {e}")))?;
        Ok(brute.vers_fiche(app_id))
    }

    /// Évaluations du jeu (toutes langues et en français).
    pub async fn avis_jeu(&self, app_id: u32) -> Resultat<AvisJeu> {
        let entree = serde_json::json!({
            "ids": [{ "appid": app_id }],
            "context": { "language": "french", "country_code": "FR" },
            "data_request": { "include_reviews": true }
        });
        let url = Url::parse_with_params(
            "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/",
            &[("input_json", entree.to_string())],
        )
        .map_err(|_| Erreur::Interne("URL".into()))?;
        let corps: serde_json::Value = self.obtenir(url).await?;
        let r = &corps["response"]["store_items"][0]["reviews"];
        Ok(AvisJeu { global: resume_avis(&r["summary_filtered"]), francais: resume_avis(&r["summary_language_specific"]) })
    }

    /// Vitrine du magasin : offres, meilleures ventes et nouveautés (jeux seulement).
    pub async fn vitrine_magasin(&self) -> Resultat<VitrineMagasin> {
        let url = Url::parse_with_params(
            "https://store.steampowered.com/api/featuredcategories",
            &[("cc", "fr"), ("l", "french")],
        )
        .map_err(|_| Erreur::Interne("URL".into()))?;
        let corps: serde_json::Value = self.obtenir(url).await?;
        Ok(VitrineMagasin {
            offres: offres(&corps["specials"], 12),
            meilleures_ventes: offres(&corps["top_sellers"], 12),
            nouveautes: offres(&corps["new_releases"], 12),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MINIMUM: &str = "<strong>Minimale\u{a0}:</strong><br><ul class=\"bb_ul\"><li>Système d'exploitation et processeur 64 bits nécessaires<br></li><li><strong>Système d'exploitation\u{a0}:</strong> Windows 10 64-bit<br></li><li><strong>Mémoire vive\u{a0}:</strong> 8\u{a0}GB de mémoire<br></li><li><strong>Graphiques\u{a0}:</strong> GeForce GTX 950, Radeon R7 360<br></li><li><strong>Espace disque\u{a0}:</strong> 11\u{a0}GB d'espace disque disponible</li></ul>";

    #[test]
    fn configuration() {
        let c = config(MINIMUM);
        assert_eq!(c.len(), 5, "{c:?}");
        assert_eq!(c[0].cle, "");
        assert_eq!(c[1], LigneConfig { cle: "Système d'exploitation".into(), valeur: "Windows 10 64-bit".into() });
        assert_eq!(c[2].valeur, "8 GB de mémoire");
        assert_eq!(c[4].cle, "Espace disque");
    }

    #[test]
    fn liste_des_langues() {
        let l = langues("Anglais<strong>*</strong>, Français, Espagnol - Espagne<br><strong>*</strong>Langues avec support audio complet");
        assert_eq!(l, vec!["Anglais", "Français", "Espagnol - Espagne"]);
    }

    #[test]
    fn prix_en_euros() {
        assert_eq!(texte_prix(1957), "19,57 €");
        assert_eq!(texte_prix(500), "5,00 €");
    }

    #[test]
    #[ignore = "réseau"]
    fn fiche_reelle() {
        let c = ClientSteam::nouveau().unwrap();
        let f = tauri::async_runtime::block_on(c.fiche_jeu(1145350)).unwrap();
        assert_eq!(f.nom, "Hades II");
        assert!(f.medias.iter().any(|m| m.video));
        assert!(!f.config_minimale.is_empty());
        let a = tauri::async_runtime::block_on(c.avis_jeu(1145350)).unwrap();
        assert!(a.global.unwrap().pourcentage > 50);
        let v = tauri::async_runtime::block_on(c.vitrine_magasin()).unwrap();
        assert!(!v.offres.is_empty());
    }
}
