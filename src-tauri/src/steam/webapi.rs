//! Client Steam Web API. La clé est ajoutée ici, côté Rust, et n'apparaît
//! dans aucun message d'erreur.

use std::collections::HashMap;
use std::time::Duration;

use reqwest::{Client, StatusCode};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use url::Url;

use crate::erreur::{Erreur, Resultat};

const API: &str = "https://api.steampowered.com";

pub struct ClientSteam {
    pub http: Client,
}

/// Réponse brute : `None` quand Steam répond 400 (« ce jeu n'a pas de succès », etc.).
enum Reponse<T> {
    Ok(T),
    Absent,
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

    fn url(chemin: &str, params: &[(&str, &str)]) -> Resultat<Url> {
        Url::parse_with_params(&format!("{API}/{chemin}"), params).map_err(|_| Erreur::Interne("URL".into()))
    }

    async fn obtenir_ou_absent<T: DeserializeOwned>(&self, url: Url) -> Resultat<Reponse<T>> {
        let rep = self.http.get(url).send().await.map_err(|e| Erreur::from(e.without_url()))?;
        match rep.status() {
            StatusCode::BAD_REQUEST => return Ok(Reponse::Absent),
            StatusCode::UNAUTHORIZED => return Err(Erreur::Prive),
            StatusCode::FORBIDDEN => return Err(Erreur::CleRefusee),
            StatusCode::TOO_MANY_REQUESTS => return Err(Erreur::Quota),
            s if !s.is_success() => return Err(Erreur::Steam(format!("HTTP {}", s.as_u16()))),
            _ => {}
        }
        rep.json::<T>().await.map(Reponse::Ok).map_err(|e| Erreur::from(e.without_url()))
    }

    async fn obtenir<T: DeserializeOwned>(&self, url: Url) -> Resultat<T> {
        match self.obtenir_ou_absent(url).await? {
            Reponse::Ok(v) => Ok(v),
            Reponse::Absent => Err(Erreur::Steam("HTTP 400".into())),
        }
    }

    // ——— Profils ———

    /// `ISteamUser/GetPlayerSummaries` pour un seul joueur.
    pub async fn resume_joueur(&self, cle: &str, steam_id: &str) -> Resultat<Joueur> {
        self.resumes_joueurs(cle, &[steam_id.to_string()])
            .await?
            .into_iter()
            .next()
            .ok_or_else(|| Erreur::Steam("profil introuvable".into()))
    }

    /// `ISteamUser/GetPlayerSummaries`, par paquets de 100 (limite de Steam).
    pub async fn resumes_joueurs(&self, cle: &str, ids: &[String]) -> Resultat<Vec<Joueur>> {
        let mut joueurs = Vec::with_capacity(ids.len());
        for paquet in ids.chunks(100) {
            let liste = paquet.join(",");
            let url = Self::url("ISteamUser/GetPlayerSummaries/v2/", &[("key", cle), ("steamids", &liste)])?;
            let corps: Enveloppe<ListeJoueurs> = self.obtenir(url).await?;
            joueurs.extend(corps.response.players.into_iter().map(Joueur::from));
        }
        Ok(joueurs)
    }

    // ——— Bibliothèque ———

    /// `IPlayerService/GetOwnedGames` avec noms et icônes, jeux gratuits compris.
    pub async fn jeux_possedes(&self, cle: &str, steam_id: &str) -> Resultat<Vec<JeuPossede>> {
        let url = Self::url(
            "IPlayerService/GetOwnedGames/v1/",
            &[
                ("key", cle),
                ("steamid", steam_id),
                ("include_appinfo", "true"),
                ("include_played_free_games", "true"),
                ("skip_unvetted_apps", "false"),
            ],
        )?;
        let corps: Enveloppe<ListeJeux> = self.obtenir(url).await?;
        Ok(corps.response.games.into_iter().map(JeuPossede::from).collect())
    }

    /// `IPlayerService/GetRecentlyPlayedGames` (deux dernières semaines).
    pub async fn jeux_recents(&self, cle: &str, steam_id: &str) -> Resultat<Vec<JeuPossede>> {
        let url = Self::url(
            "IPlayerService/GetRecentlyPlayedGames/v1/",
            &[("key", cle), ("steamid", steam_id), ("count", "0")],
        )?;
        let corps: Enveloppe<ListeJeux> = self.obtenir(url).await?;
        Ok(corps.response.games.into_iter().map(JeuPossede::from).collect())
    }

    // ——— Niveau et badges ———

    /// `IPlayerService/GetBadges` : niveau, XP et badges.
    pub async fn niveau_badges(&self, cle: &str, steam_id: &str) -> Resultat<NiveauBadges> {
        let url = Self::url("IPlayerService/GetBadges/v1/", &[("key", cle), ("steamid", steam_id)])?;
        let corps: Enveloppe<BadgesBruts> = self.obtenir(url).await?;
        let b = corps.response;
        Ok(NiveauBadges {
            niveau: b.player_level,
            xp: b.player_xp,
            xp_niveau_actuel: b.player_xp_needed_current_level,
            xp_pour_suivant: b.player_xp_needed_to_level_up,
            badges: b
                .badges
                .into_iter()
                .map(|x| Badge {
                    id: x.badgeid,
                    app_id: x.appid,
                    niveau: x.level,
                    xp: x.xp,
                    obtenu_le: x.completion_time,
                    rarete: x.scarcity,
                })
                .collect(),
        })
    }

    // ——— Amis ———

    /// `ISteamUser/GetFriendList` puis les profils. Liste privée → `prive = true`.
    pub async fn amis(&self, cle: &str, steam_id: &str) -> Resultat<ListeAmis> {
        let url = Self::url(
            "ISteamUser/GetFriendList/v1/",
            &[("key", cle), ("steamid", steam_id), ("relationship", "friend")],
        )?;
        let liste: AmisBruts = match self.obtenir_ou_absent(url).await {
            Ok(Reponse::Ok(l)) => l,
            Ok(Reponse::Absent) | Err(Erreur::Prive) => return Ok(ListeAmis { prive: true, amis: vec![] }),
            Err(e) => return Err(e),
        };
        let depuis: HashMap<String, i64> =
            liste.friendslist.friends.iter().map(|a| (a.steamid.clone(), a.friend_since)).collect();
        let ids: Vec<String> = liste.friendslist.friends.into_iter().map(|a| a.steamid).collect();
        let mut amis: Vec<Ami> = self
            .resumes_joueurs(cle, &ids)
            .await?
            .into_iter()
            .map(|j| Ami { ami_depuis: depuis.get(&j.steam_id).copied().unwrap_or(0), joueur: j })
            .collect();
        // En jeu d'abord, puis en ligne, puis par dernière connexion.
        amis.sort_by_key(|a| {
            let en_jeu = a.joueur.jeu_en_cours.is_some();
            let en_ligne = a.joueur.etat > 0;
            (!en_jeu, !en_ligne, -a.joueur.derniere_deconnexion.unwrap_or(0))
        });
        Ok(ListeAmis { prive: false, amis })
    }

    // ——— Succès ———

    /// Succès d'un joueur pour un jeu, fusionnés avec le schéma (icônes, succès cachés).
    /// `None` si le jeu n'a pas de succès.
    pub async fn succes(&self, cle: &str, steam_id: &str, app_id: u32, schema: &[SuccesSchema]) -> Resultat<Option<SuccesJeu>> {
        let app = app_id.to_string();
        let url = Self::url(
            "ISteamUserStats/GetPlayerAchievements/v1/",
            &[("key", cle), ("steamid", steam_id), ("appid", &app), ("l", "french")],
        )?;
        let corps: StatsJoueur = match self.obtenir_ou_absent(url).await? {
            Reponse::Ok(c) => c,
            Reponse::Absent => return Ok(None),
        };
        let Some(liste) = corps.playerstats.achievements else { return Ok(None) };
        if liste.is_empty() {
            return Ok(None);
        }
        let par_id: HashMap<&str, &SuccesSchema> = schema.iter().map(|s| (s.id.as_str(), s)).collect();
        let mut succes: Vec<Succes> = liste
            .into_iter()
            .map(|a| {
                let s = par_id.get(a.apiname.as_str());
                Succes {
                    nom: a.name.filter(|n| !n.is_empty()).or_else(|| s.map(|s| s.nom.clone())).unwrap_or_else(|| a.apiname.clone()),
                    description: a.description.filter(|d| !d.is_empty()).or_else(|| s.and_then(|s| s.description.clone())),
                    icone: s.map(|s| s.icone.clone()),
                    icone_grise: s.map(|s| s.icone_grise.clone()),
                    cache: s.is_some_and(|s| s.cache),
                    debloque: a.achieved == 1,
                    debloque_le: (a.unlocktime > 0).then_some(a.unlocktime),
                    id: a.apiname,
                }
            })
            .collect();
        succes.sort_by_key(|s| (!s.debloque, -s.debloque_le.unwrap_or(0)));
        let debloques = succes.iter().filter(|s| s.debloque).count() as u32;
        Ok(Some(SuccesJeu { app_id, total: succes.len() as u32, debloques, succes }))
    }

    /// `ISteamUserStats/GetSchemaForGame` : noms, icônes, succès cachés.
    pub async fn schema_succes(&self, cle: &str, app_id: u32) -> Resultat<Vec<SuccesSchema>> {
        let app = app_id.to_string();
        let url = Self::url("ISteamUserStats/GetSchemaForGame/v2/", &[("key", cle), ("appid", &app), ("l", "french")])?;
        let corps: SchemaBrut = match self.obtenir_ou_absent(url).await? {
            Reponse::Ok(c) => c,
            Reponse::Absent => return Ok(vec![]),
        };
        Ok(corps
            .game
            .and_then(|g| g.available_game_stats)
            .and_then(|s| s.achievements)
            .unwrap_or_default()
            .into_iter()
            .map(|a| SuccesSchema {
                id: a.name,
                nom: a.display_name,
                description: a.description,
                icone: a.icon,
                icone_grise: a.icongray,
                cache: a.hidden == 1,
            })
            .collect())
    }

    // ——— Actus ———

    /// `ISteamNews/GetNewsForApp` (sans clé) : dernières actus et patch notes d'un jeu.
    pub async fn actus(&self, app_id: u32) -> Resultat<Vec<Actu>> {
        let app = app_id.to_string();
        let url = Self::url(
            "ISteamNews/GetNewsForApp/v2/",
            &[
                ("appid", &app),
                ("count", "15"),
                ("maxlength", "0"),
                ("format", "json"),
                // Annonces officielles du jeu seulement (pas les sites de presse).
                ("feeds", "steam_community_announcements"),
            ],
        )?;
        let corps: ActusBrutes = match self.obtenir_ou_absent(url).await? {
            Reponse::Ok(c) => c,
            Reponse::Absent => return Ok(vec![]),
        };
        Ok(corps
            .appnews
            .map(|a| a.newsitems)
            .unwrap_or_default()
            .into_iter()
            .map(|n| Actu {
                patch: n.tags.iter().any(|t| t == "patchnotes"),
                id: n.gid,
                titre: n.title,
                url: n.url,
                auteur: n.author.filter(|a| !a.is_empty()),
                contenu: n.contents,
                date: n.date,
                source: n.feedlabel,
                officielle: n.feed_type == 1,
            })
            .collect())
    }
}

// ——— Formes des réponses de Steam ———

#[derive(Deserialize)]
struct Enveloppe<T> {
    response: T,
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
    lastlogoff: Option<i64>,
    lobbysteamid: Option<String>,
    gameserverip: Option<String>,
}

#[derive(Deserialize, Default)]
struct ListeJeux {
    #[serde(default)]
    games: Vec<JeuBrut>,
}

#[derive(Deserialize)]
struct JeuBrut {
    appid: u32,
    #[serde(default)]
    name: String,
    #[serde(default)]
    playtime_forever: u32,
    #[serde(default)]
    playtime_2weeks: u32,
    #[serde(default)]
    img_icon_url: String,
    #[serde(default)]
    rtime_last_played: i64,
}

#[derive(Deserialize)]
struct BadgesBruts {
    #[serde(default)]
    badges: Vec<BadgeBrut>,
    #[serde(default)]
    player_xp: u32,
    #[serde(default)]
    player_level: u32,
    #[serde(default)]
    player_xp_needed_to_level_up: u32,
    #[serde(default)]
    player_xp_needed_current_level: u32,
}

#[derive(Deserialize)]
struct BadgeBrut {
    badgeid: u32,
    appid: Option<u32>,
    #[serde(default)]
    level: u32,
    #[serde(default)]
    xp: u32,
    #[serde(default)]
    completion_time: i64,
    #[serde(default)]
    scarcity: u64,
}

#[derive(Deserialize)]
struct AmisBruts {
    friendslist: ListeAmisBrute,
}

#[derive(Deserialize)]
struct ListeAmisBrute {
    #[serde(default)]
    friends: Vec<AmiBrut>,
}

#[derive(Deserialize)]
struct AmiBrut {
    steamid: String,
    #[serde(default)]
    friend_since: i64,
}

#[derive(Deserialize)]
struct StatsJoueur {
    playerstats: StatsJoueurInterne,
}

#[derive(Deserialize)]
struct StatsJoueurInterne {
    achievements: Option<Vec<SuccesBrut>>,
}

#[derive(Deserialize)]
struct SuccesBrut {
    apiname: String,
    #[serde(default)]
    achieved: u8,
    #[serde(default)]
    unlocktime: i64,
    name: Option<String>,
    description: Option<String>,
}

#[derive(Deserialize)]
struct SchemaBrut {
    game: Option<SchemaJeu>,
}

#[derive(Deserialize)]
struct SchemaJeu {
    #[serde(rename = "availableGameStats")]
    available_game_stats: Option<SchemaStats>,
}

#[derive(Deserialize)]
struct SchemaStats {
    achievements: Option<Vec<SchemaSuccesBrut>>,
}

#[derive(Deserialize)]
struct SchemaSuccesBrut {
    name: String,
    #[serde(rename = "displayName", default)]
    display_name: String,
    description: Option<String>,
    #[serde(default)]
    hidden: u8,
    #[serde(default)]
    icon: String,
    #[serde(default)]
    icongray: String,
}

#[derive(Deserialize)]
struct ActusBrutes {
    appnews: Option<ActusInternes>,
}

#[derive(Deserialize)]
struct ActusInternes {
    #[serde(default)]
    newsitems: Vec<ActuBrute>,
}

#[derive(Deserialize)]
struct ActuBrute {
    gid: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    url: String,
    author: Option<String>,
    #[serde(default)]
    contents: String,
    #[serde(default)]
    feedlabel: String,
    #[serde(default)]
    date: i64,
    #[serde(default)]
    feed_type: u8,
    #[serde(default)]
    tags: Vec<String>,
}

// ——— Ce que reçoit le front ———

/// Profil Steam.
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
    /// Secondes depuis 1970.
    pub derniere_deconnexion: Option<i64>,
    /// Présents seulement si on peut rejoindre (rare).
    pub lobby: Option<String>,
    pub serveur: Option<String>,
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
            derniere_deconnexion: j.lastlogoff,
            lobby: j.lobbysteamid,
            serveur: j.gameserverip.filter(|s| !s.is_empty() && s != "0.0.0.0:0"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JeuPossede {
    pub app_id: u32,
    pub nom: String,
    pub minutes_total: u32,
    pub minutes_deux_semaines: u32,
    /// URL complète de la petite icône (32 px), ou vide.
    pub icone: String,
    /// Secondes depuis 1970 (0 si jamais lancé).
    pub dernier_lancement: i64,
}

impl From<JeuBrut> for JeuPossede {
    fn from(j: JeuBrut) -> Self {
        let icone = if j.img_icon_url.is_empty() {
            String::new()
        } else {
            format!(
                "https://media.steampowered.com/steamcommunity/public/images/apps/{}/{}.jpg",
                j.appid, j.img_icon_url
            )
        };
        Self {
            app_id: j.appid,
            nom: j.name,
            minutes_total: j.playtime_forever,
            minutes_deux_semaines: j.playtime_2weeks,
            icone,
            dernier_lancement: j.rtime_last_played,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NiveauBadges {
    pub niveau: u32,
    pub xp: u32,
    /// XP au début du niveau actuel.
    pub xp_niveau_actuel: u32,
    /// XP qui manque pour le niveau suivant.
    pub xp_pour_suivant: u32,
    pub badges: Vec<Badge>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Badge {
    pub id: u32,
    pub app_id: Option<u32>,
    pub niveau: u32,
    pub xp: u32,
    pub obtenu_le: i64,
    /// Nombre de joueurs qui l'ont.
    pub rarete: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListeAmis {
    pub prive: bool,
    pub amis: Vec<Ami>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ami {
    #[serde(flatten)]
    pub joueur: Joueur,
    pub ami_depuis: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuccesSchema {
    pub id: String,
    pub nom: String,
    pub description: Option<String>,
    pub icone: String,
    pub icone_grise: String,
    pub cache: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuccesJeu {
    pub app_id: u32,
    pub total: u32,
    pub debloques: u32,
    pub succes: Vec<Succes>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Succes {
    pub id: String,
    pub nom: String,
    pub description: Option<String>,
    pub icone: Option<String>,
    pub icone_grise: Option<String>,
    pub cache: bool,
    pub debloque: bool,
    pub debloque_le: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Actu {
    pub id: String,
    pub titre: String,
    pub url: String,
    pub auteur: Option<String>,
    /// Texte brut (BBCode/HTML) : nettoyé et trié à l'étape 3.
    pub contenu: String,
    pub date: i64,
    pub source: String,
    /// Annonce officielle du jeu (flux Steam), par opposition aux sites de presse.
    pub officielle: bool,
    /// Étiquetée « patchnotes » par l'éditeur.
    pub patch: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lecture_profil() {
        let json = r#"{"response":{"players":[{"steamid":"76561198000000000","communityvisibilitystate":3,
            "personaname":"Tom","profileurl":"https://steamcommunity.com/id/x/","avatarfull":"https://avatars.steamstatic.com/a_full.jpg",
            "personastate":1,"loccountrycode":"FR","gameserverip":"0.0.0.0:0"}]}}"#;
        let r: Enveloppe<ListeJoueurs> = serde_json::from_str(json).unwrap();
        let j = Joueur::from(r.response.players.into_iter().next().unwrap());
        assert_eq!(j.pseudo, "Tom");
        assert_eq!(j.pays.as_deref(), Some("FR"));
        assert!(j.jeu_en_cours.is_none());
        assert!(j.serveur.is_none(), "0.0.0.0:0 n'est pas un serveur joignable");
    }

    #[test]
    fn lecture_jeux() {
        let json = r#"{"response":{"game_count":1,"games":[{"appid":1145350,"name":"Hades II","playtime_forever":2880,
            "img_icon_url":"abc","rtime_last_played":1794068387}]}}"#;
        let r: Enveloppe<ListeJeux> = serde_json::from_str(json).unwrap();
        let j = JeuPossede::from(r.response.games.into_iter().next().unwrap());
        assert_eq!(j.minutes_total, 2880);
        assert_eq!(j.minutes_deux_semaines, 0);
        assert!(j.icone.ends_with("/1145350/abc.jpg"));
        // Profil sans jeux : `response` vide.
        let vide: Enveloppe<ListeJeux> = serde_json::from_str(r#"{"response":{}}"#).unwrap();
        assert!(vide.response.games.is_empty());
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

    /// Toutes les commandes Web API sur le vrai compte connecté (clé du Gestionnaire
    /// d'identifiants + session de l'app). N'affiche que des nombres.
    /// Lancer avec `cargo test donnees_reelles -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn donnees_reelles_du_compte() {
        let appdata = std::env::var("APPDATA").unwrap();
        let session = std::fs::read_to_string(format!("{appdata}/com.yiuno.resteam/session.json")).unwrap();
        let sid = serde_json::from_str::<serde_json::Value>(&session).unwrap()["steamId"].as_str().unwrap().to_string();
        let cle = crate::secrets::lire().unwrap().expect("aucune clé enregistrée");
        let c = ClientSteam::nouveau().unwrap();
        use tauri::async_runtime::block_on as b;

        let possedes = b(c.jeux_possedes(&cle, &sid)).unwrap();
        let minutes: u64 = possedes.iter().map(|j| j.minutes_total as u64).sum();
        println!("Jeux possédés : {} · {} h au total", possedes.len(), minutes / 60);
        let recents = b(c.jeux_recents(&cle, &sid)).unwrap();
        println!("Joués récemment : {}", recents.len());
        let n = b(c.niveau_badges(&cle, &sid)).unwrap();
        println!("Niveau : {} · {} badges", n.niveau, n.badges.len());
        let amis = b(c.amis(&cle, &sid)).unwrap();
        println!("Amis : {} (privé : {})", amis.amis.len(), amis.prive);
        let plus_joue = possedes.iter().max_by_key(|j| j.minutes_total).unwrap().app_id;
        let schema = b(c.schema_succes(&cle, plus_joue)).unwrap();
        let s = b(c.succes(&cle, &sid, plus_joue, &schema)).unwrap();
        println!(
            "Succès du jeu le plus joué : {:?} (schéma : {} entrées)",
            s.map(|s| (s.debloques, s.total, s.succes.iter().filter(|x| x.icone.is_some()).count())),
            schema.len()
        );
        // Un jeu sans succès ne doit pas faire d'erreur : 391540 = Undertale.
        println!("Jeu sans succès : {:?}", b(c.succes(&cle, &sid, 391540, &[])).map(|s| s.is_none()));
        assert!(!possedes.is_empty());
    }

    /// Actus réelles (sans clé) : Hades II.
    #[test]
    #[ignore]
    fn actus_reelles() {
        let c = ClientSteam::nouveau().unwrap();
        let a = tauri::async_runtime::block_on(c.actus(1145350)).unwrap();
        println!("{} actus · dernière : {:?}", a.len(), a.first().map(|x| &x.titre));
        assert!(!a.is_empty());
    }
}
