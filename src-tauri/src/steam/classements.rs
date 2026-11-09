//! Classements (étape 7) : jeux les plus joués (`ISteamChartsService`), meilleures
//! ventes de la semaine (`IStoreTopSellersService`) et joueurs en jeu en ce moment
//! (`ISteamUserStats/GetNumberOfCurrentPlayers`). Tout est sans clé.
//!
//! Steam ne publie pas le total « en ligne maintenant » : l'app additionne les
//! joueurs en jeu sur le top 10 des plus joués et garde ses relevés pour la courbe.

use serde::{Deserialize, Serialize};
use url::Url;

use super::webapi::ClientSteam;
use crate::erreur::{Erreur, Resultat};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Classe {
    pub rang: u32,
    pub app_id: u32,
    /// Rang de la semaine dernière (0 si nouveau).
    pub rang_avant: u32,
    /// Plus joués : pic de joueurs du jour. Ventes : semaines consécutives au classement.
    pub valeur: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Classements {
    pub plus_joues: Vec<Classe>,
    pub meilleures_ventes: Vec<Classe>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Releve {
    /// Secondes depuis 1970.
    pub le: i64,
    pub joueurs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct EnLigne {
    pub joueurs: u64,
    /// Relevés des dernières 24 h (le plus récent en dernier).
    pub releves: Vec<Releve>,
}

fn nombre(v: &serde_json::Value) -> u64 {
    v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok())).unwrap_or(0)
}

impl ClientSteam {
    pub async fn plus_joues(&self) -> Resultat<Vec<Classe>> {
        let url = Url::parse("https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/")
            .map_err(|_| Erreur::Interne("URL".into()))?;
        let corps: serde_json::Value = self.obtenir(url).await?;
        Ok(corps["response"]["ranks"]
            .as_array()
            .map(|l| {
                l.iter()
                    .filter_map(|r| {
                        Some(Classe {
                            rang: r["rank"].as_u64()? as u32,
                            app_id: r["appid"].as_u64()? as u32,
                            rang_avant: nombre(&r["last_week_rank"]) as u32,
                            valeur: nombre(&r["peak_in_game"]),
                        })
                    })
                    .take(100)
                    .collect()
            })
            .unwrap_or_default())
    }

    pub async fn meilleures_ventes(&self) -> Resultat<Vec<Classe>> {
        let entree = serde_json::json!({
            "context": { "language": "french", "country_code": "FR" },
            "country_code": "FR",
            "page_count": 100
        });
        let url = Url::parse_with_params(
            "https://api.steampowered.com/IStoreTopSellersService/GetWeeklyTopSellers/v1/",
            &[("input_json", entree.to_string())],
        )
        .map_err(|_| Erreur::Interne("URL".into()))?;
        let corps: serde_json::Value = self.obtenir(url).await?;
        Ok(corps["response"]["ranks"]
            .as_array()
            .map(|l| {
                l.iter()
                    .filter_map(|r| {
                        Some(Classe {
                            rang: r["rank"].as_u64()? as u32,
                            app_id: r["appid"].as_u64()? as u32,
                            rang_avant: nombre(&r["last_week_rank"]) as u32,
                            valeur: nombre(&r["consecutive_weeks"]),
                        })
                    })
                    .take(100)
                    .collect()
            })
            .unwrap_or_default())
    }

    pub async fn joueurs_en_jeu(&self, app_id: u32) -> Resultat<u64> {
        let id = app_id.to_string();
        let url = Url::parse_with_params(
            "https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/",
            &[("appid", id.as_str())],
        )
        .map_err(|_| Erreur::Interne("URL".into()))?;
        let corps: serde_json::Value = self.obtenir(url).await?;
        Ok(nombre(&corps["response"]["player_count"]))
    }
}

/// Ajoute un relevé, en garde un toutes les 20 min au plus, sur 24 h.
pub fn ajouter_releve(mut releves: Vec<Releve>, nouveau: Releve) -> Vec<Releve> {
    releves.retain(|r| nouveau.le - r.le < 24 * 3600);
    match releves.last_mut() {
        Some(dernier) if nouveau.le - dernier.le < 20 * 60 => *dernier = nouveau,
        _ => releves.push(nouveau),
    }
    releves
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn releves_sur_24_h() {
        let mut r = vec![];
        r = ajouter_releve(r, Releve { le: 0, joueurs: 1 });
        r = ajouter_releve(r, Releve { le: 600, joueurs: 2 });
        assert_eq!(r, vec![Releve { le: 600, joueurs: 2 }], "moins de 20 min : on remplace");
        r = ajouter_releve(r, Releve { le: 3000, joueurs: 3 });
        assert_eq!(r.len(), 2);
        r = ajouter_releve(r, Releve { le: 3000 + 24 * 3600, joueurs: 4 });
        assert_eq!(r, vec![Releve { le: 3000 + 24 * 3600, joueurs: 4 }], "plus de 24 h : effacés");
    }

    #[test]
    #[ignore = "réseau"]
    fn classements_reels() {
        let c = ClientSteam::nouveau().unwrap();
        let p = tauri::async_runtime::block_on(c.plus_joues()).unwrap();
        assert!(p.len() >= 50 && p[0].rang == 1);
        let v = tauri::async_runtime::block_on(c.meilleures_ventes()).unwrap();
        assert!(!v.is_empty());
        assert!(tauri::async_runtime::block_on(c.joueurs_en_jeu(730)).unwrap() > 1000);
    }
}
