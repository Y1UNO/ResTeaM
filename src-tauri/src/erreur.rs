//! Erreurs renvoyées au front : un code stable et un message en français.
//! Aucun message ne contient d'URL ni la clé API.

use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

pub type Resultat<T> = Result<T, Erreur>;

#[derive(Debug, thiserror::Error)]
pub enum Erreur {
    #[error("Aucune clé Steam Web API n'est enregistrée.")]
    CleAbsente,
    #[error("Steam refuse cette clé API. Vérifie-la sur steamcommunity.com/dev/apikey.")]
    CleRefusee,
    #[error("La clé fait 32 caractères : des chiffres et des lettres de A à F.")]
    CleFormat,
    #[error("Tu n'es pas connecté à Steam.")]
    SessionAbsente,
    #[error("Steam limite le nombre de requêtes. Réessaie dans un moment.")]
    Quota,
    #[error("Impossible de joindre Steam. Vérifie ta connexion Internet.")]
    Reseau,
    #[error("Steam a répondu de façon inattendue ({0}).")]
    Steam(String),
    #[error("Connexion annulée.")]
    Annule,
    #[error("La connexion a pris trop de temps. Réessaie.")]
    Delai,
    #[error("La réponse de Steam n'a pas pu être vérifiée. Réessaie.")]
    VerificationEchouee,
    #[error("Erreur interne : {0}")]
    Interne(String),
}

impl Erreur {
    pub fn code(&self) -> &'static str {
        match self {
            Erreur::CleAbsente => "cle_absente",
            Erreur::CleRefusee => "cle_refusee",
            Erreur::CleFormat => "cle_format",
            Erreur::SessionAbsente => "session_absente",
            Erreur::Quota => "quota",
            Erreur::Reseau => "reseau",
            Erreur::Steam(_) => "steam",
            Erreur::Annule => "annule",
            Erreur::Delai => "delai",
            Erreur::VerificationEchouee => "verification",
            Erreur::Interne(_) => "interne",
        }
    }

    /// Erreurs pour lesquelles on peut servir la dernière valeur en cache.
    pub fn est_passagere(&self) -> bool {
        matches!(self, Erreur::Reseau | Erreur::Quota | Erreur::Steam(_))
    }
}

impl Serialize for Erreur {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let mut st = s.serialize_struct("Erreur", 2)?;
        st.serialize_field("code", self.code())?;
        st.serialize_field("message", &self.to_string())?;
        st.end()
    }
}

impl From<reqwest::Error> for Erreur {
    fn from(e: reqwest::Error) -> Self {
        // Jamais l'URL (elle contient la clé API) : on ne garde que la nature de l'erreur.
        if e.is_decode() {
            Erreur::Steam("réponse illisible".into())
        } else if let Some(statut) = e.status() {
            Erreur::Steam(format!("HTTP {}", statut.as_u16()))
        } else {
            Erreur::Reseau
        }
    }
}

impl From<rusqlite::Error> for Erreur {
    fn from(e: rusqlite::Error) -> Self {
        Erreur::Interne(format!("cache : {e}"))
    }
}

impl From<std::io::Error> for Erreur {
    fn from(e: std::io::Error) -> Self {
        Erreur::Interne(format!("fichier : {e}"))
    }
}

impl From<serde_json::Error> for Erreur {
    fn from(e: serde_json::Error) -> Self {
        Erreur::Interne(format!("JSON : {e}"))
    }
}

impl From<keyring::Error> for Erreur {
    fn from(e: keyring::Error) -> Self {
        Erreur::Interne(format!("Gestionnaire d'identifiants Windows : {e}"))
    }
}

impl From<tauri::Error> for Erreur {
    fn from(e: tauri::Error) -> Self {
        Erreur::Interne(e.to_string())
    }
}
