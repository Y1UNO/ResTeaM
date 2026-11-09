//! Liens `steam://` construits et validés côté Rust : le front choisit une action,
//! jamais une adresse. Tous les identifiants sont vérifiés (chiffres, IP:port).

use serde::Deserialize;

/// Action demandée par le front.
#[derive(Debug, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum ActionSteam {
    /// Lancer un jeu installé.
    Jouer { app_id: u32 },
    /// Ouvrir l'installation d'un jeu.
    Installer { app_id: u32 },
    /// Page du jeu dans le magasin du client Steam (achat, liste de souhaits).
    Magasin { app_id: u32 },
    /// Rejoindre la partie d'un ami (lobby).
    RejoindreLobby { app_id: u32, lobby: String, steam_id: String },
    /// Rejoindre le serveur d'un ami.
    RejoindreServeur { adresse: String },
    /// Liste d'amis du client Steam (pour en ajouter).
    Amis,
    /// Page Téléchargements du client Steam.
    Telechargements,
    /// Vérifier l'intégrité des fichiers d'un jeu (fenêtre de Steam).
    Verifier { app_id: u32 },
    /// Annonce ou page Steam, ouverte dans le navigateur du client Steam.
    Page { url: String },
}

fn chiffres(s: &str, max: usize) -> bool {
    !s.is_empty() && s.len() <= max && s.bytes().all(|b| b.is_ascii_digit())
}

/// `1.2.3.4:27015` uniquement.
fn ip_port_valide(s: &str) -> bool {
    let Some((ip, port)) = s.rsplit_once(':') else { return false };
    let octets: Vec<&str> = ip.split('.').collect();
    octets.len() == 4
        && octets.iter().all(|o| chiffres(o, 3) && o.parse::<u16>().is_ok_and(|v| v <= 255))
        && port.parse::<u16>().is_ok_and(|p| p > 0)
        && ip != "0.0.0.0"
}

/// Pages Steam autorisées (HTTPS, domaines officiels).
fn page_autorisee(url: &str) -> bool {
    let Ok(u) = url::Url::parse(url) else { return false };
    u.scheme() == "https"
        && matches!(
            u.host_str(),
            Some("store.steampowered.com" | "steamcommunity.com" | "help.steampowered.com")
        )
}

/// Construit le lien, ou `None` si un paramètre est invalide.
pub fn construire(action: &ActionSteam) -> Option<String> {
    match action {
        ActionSteam::Jouer { app_id } => Some(format!("steam://rungameid/{app_id}")),
        ActionSteam::Installer { app_id } => Some(format!("steam://install/{app_id}")),
        ActionSteam::Magasin { app_id } => Some(format!("steam://store/{app_id}")),
        ActionSteam::RejoindreLobby { app_id, lobby, steam_id } => (chiffres(lobby, 20) && chiffres(steam_id, 17))
            .then(|| format!("steam://joinlobby/{app_id}/{lobby}/{steam_id}")),
        ActionSteam::RejoindreServeur { adresse } => {
            ip_port_valide(adresse).then(|| format!("steam://connect/{adresse}"))
        }
        ActionSteam::Amis => Some("steam://open/friends".into()),
        ActionSteam::Telechargements => Some("steam://open/downloads".into()),
        ActionSteam::Verifier { app_id } => Some(format!("steam://validate/{app_id}")),
        ActionSteam::Page { url } => page_autorisee(url).then(|| format!("steam://openurl/{url}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn liens() {
        assert_eq!(construire(&ActionSteam::Jouer { app_id: 730 }).unwrap(), "steam://rungameid/730");
        assert_eq!(construire(&ActionSteam::Installer { app_id: 730 }).unwrap(), "steam://install/730");
        assert_eq!(
            construire(&ActionSteam::RejoindreLobby {
                app_id: 1172470,
                lobby: "109775241234567890".into(),
                steam_id: "76561198000000000".into()
            })
            .unwrap(),
            "steam://joinlobby/1172470/109775241234567890/76561198000000000"
        );
        assert!(construire(&ActionSteam::RejoindreLobby { app_id: 1, lobby: "12/../x".into(), steam_id: "1".into() })
            .is_none());
        assert_eq!(
            construire(&ActionSteam::RejoindreServeur { adresse: "192.168.1.20:27015".into() }).unwrap(),
            "steam://connect/192.168.1.20:27015"
        );
        assert!(construire(&ActionSteam::RejoindreServeur { adresse: "evil.com:80".into() }).is_none());
        assert!(construire(&ActionSteam::RejoindreServeur { adresse: "1.2.3.400:80".into() }).is_none());
        assert!(construire(&ActionSteam::Page { url: "https://store.steampowered.com/news/app/1".into() }).is_some());
        assert!(construire(&ActionSteam::Page { url: "http://store.steampowered.com/".into() }).is_none());
        assert!(construire(&ActionSteam::Page { url: "https://steamcommunity.com.evil.io/".into() }).is_none());
    }

    #[test]
    fn lecture_depuis_le_front() {
        let a: ActionSteam = serde_json::from_str(r#"{"type":"jouer","appId":730}"#).unwrap();
        assert_eq!(a, ActionSteam::Jouer { app_id: 730 });
        let a: ActionSteam =
            serde_json::from_str(r#"{"type":"rejoindreLobby","appId":1,"lobby":"2","steamId":"3"}"#).unwrap();
        assert!(matches!(a, ActionSteam::RejoindreLobby { .. }));
    }
}
