//! Trophées (succès) de tous les jeux d'un joueur, en quelques appels :
//! `IPlayerService/GetTopAchievementsForGames` (avec la clé API) : tous les trophées obtenus
//! de chaque jeu, le total du jeu et leur rareté. `GetAchievementsProgress` est refusé (HTTP 405).
//! Le dernier trophée obtenu vient des jeux joués récemment (`GetPlayerAchievements`).

use serde::{Deserialize, Serialize};

use super::webapi::ClientSteam;
use crate::erreur::Resultat;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProgresJeu {
    pub app_id: u32,
    pub debloques: u32,
    pub total: u32,
}


/// Dernier trophée obtenu (parmi les jeux joués récemment).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DernierTrophee {
    pub app_id: u32,
    pub nom: String,
    pub icone: Option<String>,
    /// Secondes depuis 1970.
    pub date: i64,
}

/// Bilan des trophées d'un joueur (profil : case « Trophées » et niveau de la lune).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BilanTrophees {
    pub total: u32,
    /// Jeux qui ont des trophées, parmi les jeux joués.
    pub jeux: u32,
    /// Jeux terminés à 100 %.
    pub complets: Vec<u32>,
    pub plus_rare: Option<TropheeRare>,
    pub dernier: Option<DernierTrophee>,
}

impl BilanTrophees {
    pub fn depuis(progres: &[ProgresJeu], plus_rare: Option<TropheeRare>, dernier: Option<DernierTrophee>) -> Self {
        Self {
            total: progres.iter().map(|p| p.debloques).sum(),
            jeux: progres.len() as u32,
            complets: progres.iter().filter(|p| p.total > 0 && p.debloques >= p.total).map(|p| p.app_id).collect(),
            plus_rare,
            dernier,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TropheeRare {
    pub app_id: u32,
    pub nom: String,
    pub icone: String,
    /// Part des joueurs qui l'ont (en %).
    pub pourcentage: f64,
}

#[derive(Deserialize)]
struct ReponseTop {
    response: ContenuTop,
}
#[derive(Deserialize, Default)]
struct ContenuTop {
    #[serde(default)]
    games: Vec<JeuTop>,
}
#[derive(Deserialize)]
struct JeuTop {
    appid: u32,
    #[serde(default)]
    total_achievements: u32,
    #[serde(default)]
    achievements: Vec<SuccesTop>,
}
#[derive(Deserialize)]
struct SuccesTop {
    #[serde(default)]
    name: String,
    #[serde(default)]
    icon: String,
    #[serde(default)]
    player_percent_unlocked: serde_json::Value,
}

const ICONES: &str = "https://cdn.fastly.steamstatic.com/steamcommunity/public/images/apps";

fn pourcentage(v: &serde_json::Value) -> Option<f64> {
    v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))
}

impl ClientSteam {
    /// Trophées de chaque jeu (débloqués / total) et le plus rare obtenu, par paquets de
    /// 25 jeux : `GetTopAchievementsForGames` renvoie tous les trophées obtenus quand on
    /// en demande assez (`GetAchievementsProgress` est refusé avec une clé API : HTTP 405).
    pub async fn bilan_trophees(&self, cle: &str, steam_id: &str, app_ids: &[u32]) -> Resultat<(Vec<ProgresJeu>, Option<TropheeRare>)> {
        let mut progres = Vec::new();
        let mut rare: Option<TropheeRare> = None;
        for paquet in app_ids.chunks(25) {
            let mut params: Vec<(String, String)> = vec![
                ("key".into(), cle.into()),
                ("steamid".into(), steam_id.into()),
                ("language".into(), "french".into()),
                ("max_achievements".into(), "10000".into()),
            ];
            params.extend(paquet.iter().enumerate().map(|(i, id)| (format!("appids[{i}]"), id.to_string())));
            let p: Vec<(&str, &str)> = params.iter().map(|(a, b)| (a.as_str(), b.as_str())).collect();
            let url = Self::url("IPlayerService/GetTopAchievementsForGames/v1/", &p)?;
            let r: ReponseTop = self.obtenir(url).await?;
            for jeu in r.response.games {
                if jeu.total_achievements == 0 {
                    continue;
                }
                progres.push(ProgresJeu { app_id: jeu.appid, debloques: (jeu.achievements.len() as u32).min(jeu.total_achievements), total: jeu.total_achievements });
                for s in &jeu.achievements {
                    let Some(pc) = pourcentage(&s.player_percent_unlocked) else { continue };
                    if rare.as_ref().is_none_or(|m| pc < m.pourcentage) {
                        let icone = if s.icon.starts_with("https://") || s.icon.is_empty() { s.icon.clone() } else { format!("{ICONES}/{}/{}", jeu.appid, s.icon) };
                        rare = Some(TropheeRare { app_id: jeu.appid, nom: s.name.clone(), icone, pourcentage: pc });
                    }
                }
            }
        }
        Ok((progres, rare))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lecture_des_reponses() {
        let t: ReponseTop = serde_json::from_str(
            r#"{"response":{"games":[{"appid":1,"total_achievements":10,"achievements":[{"statid":1,"bit":2,"name":"Rare","icon":"a.jpg","player_percent_unlocked":"0.4"}]}]}}"#,
        )
        .unwrap();
        assert_eq!(pourcentage(&t.response.games[0].achievements[0].player_percent_unlocked), Some(0.4));
        let vide: ReponseTop = serde_json::from_str(r#"{"response":{}}"#).unwrap();
        assert!(vide.response.games.is_empty());
        assert_eq!(t.response.games[0].total_achievements, 10);
        let p = [ProgresJeu { app_id: 1, debloques: 10, total: 10 }, ProgresJeu { app_id: 2, debloques: 3, total: 40 }];
        let b = BilanTrophees::depuis(&p, None, None);
        assert_eq!((b.total, b.jeux, b.complets), (13, 2, vec![1]));
    }

    /// Appels réels avec la clé de Tom (jamais affichée) : seulement des totaux.
    #[test]
    #[ignore = "appelle Steam avec la clé enregistrée"]
    fn essai_reel() {
        let cle = crate::secrets::lire().unwrap().unwrap();
        let dossier = std::path::PathBuf::from(std::env::var("APPDATA").unwrap()).join("com.yiuno.resteam");
        let session: serde_json::Value = serde_json::from_str(&crate::coffre::lire(&std::fs::read_to_string(dossier.join("session.json")).unwrap()).unwrap()).unwrap();
        let sid = session["steamId"].as_str().or(session["steam_id"].as_str()).unwrap().to_string();
        tauri::async_runtime::block_on(async {
            let c = ClientSteam::nouveau().unwrap();
            let jeux = c.jeux_possedes(&cle, &sid).await.unwrap();
            let ids: Vec<u32> = jeux.iter().filter(|j| j.minutes_total > 0).map(|j| j.app_id).collect();
            let t = std::time::Instant::now();
            let (p, rare) = c.bilan_trophees(&cle, &sid, &ids).await.unwrap();
            let total: u32 = p.iter().map(|x| x.debloques).sum();
            let complets = p.iter().filter(|x| x.debloques == x.total).count();
            println!("jeux joués {} · avec succès {} · trophées {total} · jeux à 100 % {complets} · {:?}", ids.len(), p.len(), t.elapsed());
            println!("plus rare : {:?}", rare.map(|r| (r.app_id, r.pourcentage, r.icone.starts_with("https://"))));
            // Recoupement avec GetPlayerAchievements (jeu par jeu) sur 6 jeux.
            let mut ecarts = 0;
            for x in p.iter().take(6) {
                if let Ok(Some(j)) = c.succes(&cle, &sid, x.app_id, &[]).await {
                    if (j.debloques, j.total) != (x.debloques, x.total) {
                        ecarts += 1;
                        println!("écart {} : {:?} contre {:?}", x.app_id, (j.debloques, j.total), (x.debloques, x.total));
                    }
                }
            }
            println!("recoupement : {ecarts} écart(s) sur 6 jeux");
        });
    }
}
