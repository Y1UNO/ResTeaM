//! Adresses des images d'un jeu (jaquette 600×900, visuel « hero », bannière),
//! lues dans `IStoreBrowseService/GetItems` : les jeux récents ont des chemins
//! avec une empreinte, qu'on ne peut pas deviner.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use url::Url;

use super::webapi::ClientSteam;
use crate::erreur::{Erreur, Resultat};

const CDN: &str = "https://shared.akamai.steamstatic.com/store_item_assets/";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImagesJeu {
    /// Jaquette verticale 600×900 (bibliothèque).
    pub jaquette: Option<String>,
    /// Grand visuel horizontal de la bibliothèque (fond du hero).
    pub hero: Option<String>,
    /// Bannière 460×215.
    pub banniere: Option<String>,
}

/// Adresses sans empreinte : marchent pour la plupart des jeux plus anciens.
pub fn adresses_classiques(app_id: u32) -> ImagesJeu {
    let base = format!("{CDN}steam/apps/{app_id}/");
    ImagesJeu {
        jaquette: Some(format!("{base}library_600x900.jpg")),
        hero: Some(format!("{base}library_hero_2x.jpg")),
        banniere: Some(format!("{base}header.jpg")),
    }
}

#[derive(Deserialize)]
struct Reponse {
    response: Contenu,
}

#[derive(Deserialize)]
struct Contenu {
    #[serde(default)]
    store_items: Vec<Element>,
}

#[derive(Deserialize)]
struct Element {
    appid: Option<u32>,
    #[serde(default)]
    success: u8,
    assets: Option<Assets>,
}

#[derive(Deserialize)]
struct Assets {
    asset_url_format: Option<String>,
    library_capsule: Option<String>,
    library_capsule_2x: Option<String>,
    library_hero: Option<String>,
    library_hero_2x: Option<String>,
    header: Option<String>,
}

fn adresse(format: &str, fichier: &Option<String>) -> Option<String> {
    let f = fichier.as_deref().filter(|f| !f.is_empty())?;
    Some(format!("{CDN}{}", format.replace("${FILENAME}", f)))
}

impl ClientSteam {
    /// Images de plusieurs jeux en une requête (sans clé). Les jeux inconnus du
    /// magasin reçoivent les adresses classiques.
    pub async fn images(&self, app_ids: &[u32]) -> Resultat<HashMap<u32, ImagesJeu>> {
        let mut resultat = HashMap::new();
        for paquet in app_ids.chunks(50) {
            let ids: Vec<serde_json::Value> = paquet.iter().map(|id| serde_json::json!({ "appid": id })).collect();
            let entree = serde_json::json!({
                "ids": ids,
                "context": { "language": "french", "country_code": "FR" },
                "data_request": { "include_assets": true }
            });
            let url = Url::parse_with_params(
                "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/",
                &[("input_json", entree.to_string())],
            )
            .map_err(|_| Erreur::Interne("URL".into()))?;
            let rep = self.http.get(url).send().await.map_err(|e| Erreur::from(e.without_url()))?;
            if !rep.status().is_success() {
                return Err(Erreur::Steam(format!("HTTP {}", rep.status().as_u16())));
            }
            let corps: Reponse = rep.json().await.map_err(|e| Erreur::from(e.without_url()))?;
            for e in corps.response.store_items {
                let (Some(id), Some(a)) = (e.appid, e.assets) else { continue };
                if e.success != 1 {
                    continue;
                }
                let Some(format) = a.asset_url_format.as_deref() else { continue };
                let classique = adresses_classiques(id);
                resultat.insert(
                    id,
                    ImagesJeu {
                        jaquette: adresse(format, &a.library_capsule_2x)
                            .or_else(|| adresse(format, &a.library_capsule))
                            .or(classique.jaquette),
                        // 3840×1240 : net même étiré sur un écran 1440p.
                        hero: adresse(format, &a.library_hero_2x)
                            .or_else(|| adresse(format, &a.library_hero))
                            .or(classique.hero),
                        banniere: adresse(format, &a.header).or(classique.banniere),
                    },
                );
            }
        }
        for id in app_ids {
            resultat.entry(*id).or_insert_with(|| adresses_classiques(*id));
        }
        Ok(resultat)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn construction_adresse() {
        let f = "steam/apps/1145350/${FILENAME}?t=1779901265";
        assert_eq!(
            adresse(f, &Some("2ba1/library_capsule.jpg".into())).unwrap(),
            "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1145350/2ba1/library_capsule.jpg?t=1779901265"
        );
        assert!(adresse(f, &None).is_none());
        assert!(adresse(f, &Some(String::new())).is_none());
    }

    #[test]
    #[ignore]
    fn images_reelles() {
        let c = ClientSteam::nouveau().unwrap();
        let i = tauri::async_runtime::block_on(c.images(&[1145350, 1903340, 99999999])).unwrap();
        println!("{:#?}", i.get(&1145350));
        assert!(i[&1145350].jaquette.as_deref().unwrap().contains("library_capsule"));
        assert!(i[&99999999].jaquette.as_deref().unwrap().ends_with("library_600x900.jpg"));
    }
}
