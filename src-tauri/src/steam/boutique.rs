//! Boutique complète (demande de Tom : « une vraie boutique, avec une recherche ») :
//! fiches courtes de produits en lot (`GetItems` : images, prix, avis, tags, captures),
//! recherche (`storesearch`), rayons par genre ou gratuits (recherche JSON du magasin)
//! et liste de souhaits (`IWishlistService/GetWishlist`). Tout est sans clé.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use url::Url;

use super::magasin::ResumeAvis;
use super::webapi::ClientSteam;
use crate::erreur::{Erreur, Resultat};

const CDN: &str = "https://shared.akamai.steamstatic.com/store_item_assets/";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PrixProduit {
    /// Centimes.
    pub final_: u64,
    pub initial: u64,
    pub reduction: u32,
    pub texte_final: String,
    pub texte_initial: String,
    /// Fin de la promotion (secondes depuis 1970), si connue.
    pub fin_promo: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Produit {
    pub app_id: u32,
    pub nom: String,
    /// Bannière 460×215.
    pub banniere: Option<String>,
    /// Capsule 616×353.
    pub capsule: Option<String>,
    /// Jaquette 600×900.
    pub jaquette: Option<String>,
    pub hero: Option<String>,
    pub prix: Option<PrixProduit>,
    pub gratuit: bool,
    /// Date de sortie (secondes), ou texte (« Prochainement ») pour un jeu à venir.
    pub sortie: Option<i64>,
    pub sortie_texte: Option<String>,
    pub a_venir: bool,
    pub avis: Option<ResumeAvis>,
    pub tags: Vec<String>,
    /// Captures 600×338.
    pub captures: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Souhait {
    pub app_id: u32,
    pub priorite: u32,
    pub ajoute_le: i64,
}

fn texte_prix(centimes: u64) -> String {
    format!("{},{:02} €", centimes / 100, centimes % 100)
}

fn nombre(v: &serde_json::Value) -> Option<u64> {
    v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))
}

fn adresse(format: &str, fichier: &serde_json::Value) -> Option<String> {
    let f = fichier.as_str().filter(|f| !f.is_empty())?;
    Some(format!("{CDN}{}", format.replace("${FILENAME}", f)))
}

fn produit(it: &serde_json::Value, tags: &HashMap<u32, String>) -> Option<Produit> {
    if it["success"].as_u64() != Some(1) {
        return None;
    }
    let app_id = it["appid"].as_u64()? as u32;
    let a = &it["assets"];
    let f = a["asset_url_format"].as_str().unwrap_or_default();
    let base = format!("{CDN}steam/apps/{app_id}/");
    let o = &it["best_purchase_option"];
    let prix = nombre(&o["final_price_in_cents"]).filter(|p| *p > 0).map(|final_| {
        let initial = nombre(&o["original_price_in_cents"]).unwrap_or(final_);
        PrixProduit {
            final_,
            initial,
            reduction: o["discount_pct"].as_u64().unwrap_or(0) as u32,
            texte_final: texte_prix(final_),
            texte_initial: texte_prix(initial),
            fin_promo: o["active_discounts"][0]["discount_end_date"].as_i64(),
        }
    });
    let r = &it["release"];
    let a_venir = r["is_coming_soon"].as_bool().unwrap_or(false);
    let avis = &it["reviews"]["summary_filtered"];
    let avis = nombre(&avis["review_count"]).filter(|n| *n > 0).map(|n| {
        let l = avis["review_score_label"].as_str().unwrap_or_default();
        let mut c = l.chars();
        ResumeAvis {
            libelle: c.next().map(|p| p.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default(),
            pourcentage: avis["percent_positive"].as_u64().unwrap_or(0) as u32,
            nombre: n,
        }
    });
    let captures = it["screenshots"]["all_ages_screenshots"]
        .as_array()
        .map(|l| {
            l.iter()
                .filter_map(|s| s["filename"].as_str())
                .take(4)
                .map(|f| format!("{CDN}{}", f.replacen(".jpg", ".600x338.jpg", 1)))
                .collect()
        })
        .unwrap_or_default();
    Some(Produit {
        app_id,
        nom: it["name"].as_str().unwrap_or_default().to_string(),
        banniere: adresse(f, &a["header"]).or_else(|| Some(format!("{base}header.jpg"))),
        capsule: adresse(f, &a["main_capsule"]).or_else(|| adresse(f, &a["header"])),
        jaquette: adresse(f, &a["library_capsule"]).or_else(|| Some(format!("{base}library_600x900.jpg"))),
        hero: adresse(f, &a["library_hero"]).or_else(|| Some(format!("{base}library_hero.jpg"))),
        gratuit: it["is_free"].as_bool().unwrap_or(false) || (prix.is_none() && !a_venir && o.is_object()),
        prix,
        sortie: r["steam_release_date"].as_i64().or_else(|| r["original_release_date"].as_i64()),
        sortie_texte: r["custom_release_date_message"].as_str().map(str::to_string),
        a_venir,
        avis,
        tags: it["tagids"]
            .as_array()
            .map(|l| l.iter().filter_map(|t| t.as_u64()).filter_map(|t| tags.get(&(t as u32)).cloned()).take(4).collect())
            .unwrap_or_default(),
        captures,
    })
}

/// « …/steam/apps/3393110/a5a6…/capsule_sm_120.jpg » → 3393110.
fn app_id_depuis_logo(logo: &str) -> Option<u32> {
    let apres = logo.split("/apps/").nth(1)?;
    apres.split('/').next()?.parse().ok()
}

impl ClientSteam {
    /// Noms français des tags du magasin (446 tags).
    pub async fn noms_tags(&self) -> Resultat<HashMap<u32, String>> {
        let url = Url::parse_with_params(
            "https://api.steampowered.com/IStoreService/GetTagList/v1/",
            &[("language", "french")],
        )
        .map_err(|_| Erreur::Interne("URL".into()))?;
        let corps: serde_json::Value = self.obtenir(url).await?;
        Ok(corps["response"]["tags"]
            .as_array()
            .map(|l| {
                l.iter()
                    .filter_map(|t| Some((t["tagid"].as_u64()? as u32, t["name"].as_str()?.to_string())))
                    .collect()
            })
            .unwrap_or_default())
    }

    /// Fiches courtes de plusieurs jeux, par paquets de 50.
    pub async fn produits(&self, app_ids: &[u32], tags: &HashMap<u32, String>) -> Resultat<Vec<Produit>> {
        let mut tous = HashMap::new();
        for paquet in app_ids.chunks(50) {
            let ids: Vec<serde_json::Value> = paquet.iter().map(|id| serde_json::json!({ "appid": id })).collect();
            let entree = serde_json::json!({
                "ids": ids,
                "context": { "language": "french", "country_code": "FR" },
                "data_request": {
                    "include_assets": true,
                    "include_release": true,
                    "include_reviews": true,
                    "include_all_purchase_options": true,
                    "include_screenshots": true,
                    "include_tag_count": 6
                }
            });
            let url = Url::parse_with_params(
                "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/",
                &[("input_json", entree.to_string())],
            )
            .map_err(|_| Erreur::Interne("URL".into()))?;
            let corps: serde_json::Value = self.obtenir(url).await?;
            for it in corps["response"]["store_items"].as_array().into_iter().flatten() {
                if let Some(p) = produit(it, tags) {
                    tous.insert(p.app_id, p);
                }
            }
        }
        // Même ordre que la demande.
        Ok(app_ids.iter().filter_map(|id| tous.remove(id)).collect())
    }

    /// Recherche par nom (jeux seulement), 20 résultats au plus.
    pub async fn recherche_ids(&self, terme: &str) -> Resultat<Vec<u32>> {
        let url = Url::parse_with_params(
            "https://store.steampowered.com/api/storesearch/",
            &[("term", terme), ("l", "french"), ("cc", "FR")],
        )
        .map_err(|_| Erreur::Interne("URL".into()))?;
        let corps: serde_json::Value = self.obtenir(url).await?;
        Ok(corps["items"]
            .as_array()
            .map(|l| {
                l.iter()
                    .filter(|i| i["type"].as_str() == Some("app"))
                    .filter_map(|i| i["id"].as_u64().map(|v| v as u32))
                    .take(20)
                    .collect()
            })
            .unwrap_or_default())
    }

    /// Rayon du magasin, trié par meilleures ventes : `gratuits` ou `tag:<id>`.
    pub async fn rayon_ids(&self, rayon: &str) -> Resultat<Vec<u32>> {
        let mut params: Vec<(&str, String)> = vec![
            ("start", "0".into()),
            ("count", "30".into()),
            ("filter", "topsellers".into()),
            ("category1", "998".into()), // jeux seulement
            ("json", "1".into()),
            ("cc", "FR".into()),
            ("l", "french".into()),
        ];
        if rayon == "gratuits" {
            params.push(("maxprice", "free".into()));
        } else if let Some(tag) = rayon.strip_prefix("tag:").filter(|t| t.chars().all(|c| c.is_ascii_digit()) && !t.is_empty()) {
            params.push(("tags", tag.into()));
        } else {
            return Err(Erreur::Interne("rayon inconnu".into()));
        }
        let url = Url::parse_with_params("https://store.steampowered.com/search/results/", &params)
            .map_err(|_| Erreur::Interne("URL".into()))?;
        let corps: serde_json::Value = self.obtenir(url).await?;
        let mut vus = std::collections::HashSet::new();
        Ok(corps["items"]
            .as_array()
            .map(|l| {
                l.iter()
                    .filter_map(|i| app_id_depuis_logo(i["logo"].as_str()?))
                    .filter(|id| vus.insert(*id))
                    .collect()
            })
            .unwrap_or_default())
    }

    /// DLC cherchés par nom (catégorie DLC du magasin), pour les jeux dont la fiche
    /// ne liste pas les DLC (ex. Apex Legends).
    pub async fn dlc_par_recherche(&self, nom: &str) -> Resultat<Vec<u32>> {
        let params: Vec<(&str, &str)> = vec![
            ("term", nom),
            ("category1", "21"),
            ("count", "50"),
            ("json", "1"),
            ("cc", "FR"),
            ("l", "french"),
        ];
        let url = Url::parse_with_params("https://store.steampowered.com/search/results/", &params)
            .map_err(|_| Erreur::Interne("URL".into()))?;
        let corps: serde_json::Value = self.obtenir(url).await?;
        let mut vus = std::collections::HashSet::new();
        Ok(corps["items"]
            .as_array()
            .map(|l| l.iter().filter_map(|i| app_id_depuis_logo(i["logo"].as_str()?)).filter(|id| vus.insert(*id)).collect())
            .unwrap_or_default())
    }

    /// Liste de souhaits du compte (publique ou la sienne).
    pub async fn souhaits(&self, steam_id: &str) -> Resultat<Vec<Souhait>> {
        let url = Url::parse_with_params(
            "https://api.steampowered.com/IWishlistService/GetWishlist/v1/",
            &[("steamid", steam_id)],
        )
        .map_err(|_| Erreur::Interne("URL".into()))?;
        let corps: serde_json::Value = self.obtenir(url).await?;
        let mut liste: Vec<Souhait> = corps["response"]["items"]
            .as_array()
            .map(|l| {
                l.iter()
                    .filter_map(|i| {
                        Some(Souhait {
                            app_id: i["appid"].as_u64()? as u32,
                            priorite: i["priority"].as_u64().unwrap_or(0) as u32,
                            ajoute_le: i["date_added"].as_i64().unwrap_or(0),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();
        // Ordre choisi dans Steam (0 = pas classé, à la fin).
        liste.sort_by_key(|s| (s.priorite == 0, s.priorite, -s.ajoute_le));
        Ok(liste)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn appid_du_logo() {
        assert_eq!(
            app_id_depuis_logo("https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3393110/a5a6/capsule_sm_120.jpg?t=1"),
            Some(3393110)
        );
        assert_eq!(app_id_depuis_logo("https://exemple/sans"), None);
    }

    #[test]
    fn produit_en_promo() {
        let it = serde_json::json!({
            "success": 1, "appid": 42, "name": "Jeu",
            "assets": { "asset_url_format": "steam/apps/42/abc/${FILENAME}?t=1", "header": "header.jpg", "library_capsule": "library_600x900.jpg" },
            "best_purchase_option": { "final_price_in_cents": "4799", "original_price_in_cents": "7999", "discount_pct": 40,
              "active_discounts": [{ "discount_end_date": 1794247200 }] },
            "release": { "steam_release_date": 1779804000 },
            "reviews": { "summary_filtered": { "review_count": 10, "percent_positive": 90, "review_score_label": "très positives" } },
            "tagids": [19, 9],
            "screenshots": { "all_ages_screenshots": [{ "filename": "steam/apps/42/ss_a.jpg?t=1" }] }
        });
        let tags = HashMap::from([(19, "Action".to_string()), (9, "Stratégie".to_string())]);
        let p = produit(&it, &tags).unwrap();
        assert_eq!(p.prix.as_ref().unwrap().texte_final, "47,99 €");
        assert_eq!(p.prix.as_ref().unwrap().reduction, 40);
        assert_eq!(p.avis.unwrap().libelle, "Très positives");
        assert_eq!(p.tags, vec!["Action", "Stratégie"]);
        assert_eq!(p.captures[0], format!("{CDN}steam/apps/42/ss_a.600x338.jpg?t=1"));
        assert_eq!(p.banniere.unwrap(), format!("{CDN}steam/apps/42/abc/header.jpg?t=1"));
    }

    #[test]
    #[ignore = "réseau"]
    fn boutique_reelle() {
        let c = ClientSteam::nouveau().unwrap();
        let tags = tauri::async_runtime::block_on(c.noms_tags()).unwrap();
        assert!(tags.len() > 100);
        let ids = tauri::async_runtime::block_on(c.recherche_ids("hades")).unwrap();
        assert!(ids.contains(&1145350));
        let p = tauri::async_runtime::block_on(c.produits(&ids, &tags)).unwrap();
        assert!(p.iter().any(|x| x.nom == "Hades II" && x.prix.is_some()));
        let g = tauri::async_runtime::block_on(c.rayon_ids("gratuits")).unwrap();
        assert!(!g.is_empty());
        let a = tauri::async_runtime::block_on(c.rayon_ids("tag:19")).unwrap();
        assert!(!a.is_empty());
    }

    #[test]
    #[ignore = "réseau"]
    fn dlc_d_apex_par_recherche() {
        let c = ClientSteam::nouveau().unwrap();
        let ids = tauri::async_runtime::block_on(c.dlc_par_recherche("Apex Legends")).unwrap();
        let p = tauri::async_runtime::block_on(c.produits(&ids, &HashMap::new())).unwrap();
        let noms: Vec<&str> = p.iter().map(|x| x.nom.as_str()).take(6).collect();
        println!("{} DLC trouvés, ex. {noms:?}", p.len());
        assert!(!p.is_empty());
    }
}
