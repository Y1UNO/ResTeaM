//! Client Steam Web API. La clé est ajoutée ici, côté Rust, et n'apparaît
//! dans aucun message d'erreur.

use std::time::Duration;

use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use url::Url;

use crate::erreur::{Erreur, Resultat};

const API: &str = "https://api.steampowered.com";

pub struct ClientSteam {
    pub http: Client,
}

impl ClientSteam {
    pub fn nouveau() -> Resultat<Self> {
        let http = Client::builder()
            .user_agent(concat!("ResTeaM/", env!("CARGO_PKG_VERSION")))
            .timeout(Duration::from_secs(15))
            .connect_timeout(Duration::from_secs(8))
            .build()
            .map_err(|_| Erreur::Interne("client HTTP".into()))?;
        Ok(Self { http })
    }

    async fn obtenir<T: for<'de> Deserialize<'de>>(&self, url: Url) -> Resultat<T> {
        let rep = self.http.get(url).send().await.map_err(|e| Erreur::from(e.without_url()))?;
        match rep.status() {
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => return Err(Erreur::CleRefusee),
            StatusCode::TOO_MANY_REQUESTS => return Err(Erreur::Quota),
            s if !s.is_success() => return Err(Erreur::Steam(format!("HTTP {}", s.as_u16()))),
            _ => {}
        }
        rep.json::<T>().await.map_err(|e| Erreur::from(e.without_url()))
    }

    /// `ISteamUser/GetPlayerSummaries` pour un seul joueur.
    pub async fn resume_joueur(&self, cle: &str, steam_id: &str) -> Resultat<Joueur> {
        let url = Url::parse_with_params(
            &format!("{API}/ISteamUser/GetPlayerSummaries/v2/"),
            &[("key", cle), ("steamids", steam_id)],
        )
        .map_err(|_| Erreur::Interne("URL".into()))?;
        let corps: ReponseResumes = self.obtenir(url).await?;
        corps
            .response
            .players
            .into_iter()
            .next()
            .map(Joueur::from)
            .ok_or_else(|| Erreur::Steam("profil introuvable".into()))
    }
}

#[derive(Deserialize)]
struct ReponseResumes {
    response: ListeJoueurs,
}

#[derive(Deserialize)]
struct ListeJoueurs {
    #[serde(default)]
    players: Vec<JoueurBrut>,
}

#[derive(Deserialize)]
struct JoueurBrut {
    steamid: String,
    personaname: String,
    profileurl: String,
    avatarfull: String,
    #[serde(default)]
    personastate: u8,
    #[serde(default)]
    communityvisibilitystate: u8,
    realname: Option<String>,
    loccountrycode: Option<String>,
    gameextrainfo: Option<String>,
    gameid: Option<String>,
}

/// Profil Steam, tel que le front le reçoit.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Joueur {
    pub steam_id: String,
    pub pseudo: String,
    pub avatar: String,
    pub url_profil: String,
    /// 0 hors ligne, 1 en ligne, 2 occupé, 3 absent, 4 en veille, 5 veut échanger, 6 veut jouer.
    pub etat: u8,
    /// 3 = profil public.
    pub visibilite: u8,
    pub nom_reel: Option<String>,
    pub pays: Option<String>,
    pub jeu_en_cours: Option<String>,
    pub jeu_en_cours_id: Option<String>,
}

impl From<JoueurBrut> for Joueur {
    fn from(j: JoueurBrut) -> Self {
        Self {
            steam_id: j.steamid,
            pseudo: j.personaname,
            avatar: j.avatarfull,
            url_profil: j.profileurl,
            etat: j.personastate,
            visibilite: j.communityvisibilitystate,
            nom_reel: j.realname,
            pays: j.loccountrycode,
            jeu_en_cours: j.gameextrainfo,
            jeu_en_cours_id: j.gameid,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lecture_reponse() {
        let json = r#"{"response":{"players":[{"steamid":"76561198000000000","communityvisibilitystate":3,
            "personaname":"Tom","profileurl":"https://steamcommunity.com/id/x/","avatarfull":"https://avatars.steamstatic.com/a_full.jpg",
            "personastate":1,"loccountrycode":"FR"}]}}"#;
        let r: ReponseResumes = serde_json::from_str(json).unwrap();
        let j = Joueur::from(r.response.players.into_iter().next().unwrap());
        assert_eq!(j.pseudo, "Tom");
        assert_eq!(j.pays.as_deref(), Some("FR"));
        assert_eq!(j.etat, 1);
        assert!(j.jeu_en_cours.is_none());
    }

    /// Vrai appel réseau avec une clé factice : Steam doit la refuser proprement.
    /// Lancer avec `cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn cle_factice_refusee() {
        let c = ClientSteam::nouveau().unwrap();
        let r = tauri::async_runtime::block_on(
            c.resume_joueur("00000000000000000000000000000000", "76561197960435530"),
        );
        assert!(matches!(r, Err(Erreur::CleRefusee)), "obtenu : {:?}", r.err());
    }
}
