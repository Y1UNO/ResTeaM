//! Clé Steam Web API, rangée dans le Gestionnaire d'identifiants Windows.
//! Elle ne quitte jamais le Rust : le front sait seulement si elle existe.

use keyring::Entry;

use crate::erreur::Resultat;

const SERVICE: &str = "ResTeaM";
const COMPTE: &str = "steam-web-api-key";

fn entree() -> Resultat<Entry> {
    Ok(Entry::new(SERVICE, COMPTE)?)
}

/// Format d'une clé Steam Web API : 32 caractères hexadécimaux.
pub fn format_valide(cle: &str) -> bool {
    cle.len() == 32 && cle.bytes().all(|b| b.is_ascii_hexdigit())
}

/// Nettoie la saisie (espaces, minuscules) avant de la valider.
pub fn normaliser(saisie: &str) -> String {
    saisie
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect::<String>()
        .to_ascii_uppercase()
}

pub fn lire() -> Resultat<Option<String>> {
    match entree()?.get_password() {
        Ok(cle) => Ok(Some(cle)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn ecrire(cle: &str) -> Resultat<()> {
    entree()?.set_password(cle)?;
    Ok(())
}

pub fn supprimer() -> Resultat<()> {
    match entree()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_de_cle() {
        assert!(format_valide("0123456789ABCDEF0123456789abcdef"));
        assert!(!format_valide("0123456789ABCDEF0123456789ABCDE"));
        assert!(!format_valide("0123456789ABCDEF0123456789ABCDEG"));
        assert_eq!(normaliser(" 01ab cd \n"), "01ABCD");
    }

    #[test]
    fn gestionnaire_identifiants_aller_retour() {
        // Entrée de test séparée : ne touche pas à la vraie clé.
        let e = Entry::new("ResTeaM-test", "cle-factice").unwrap();
        e.set_password("00000000000000000000000000000000").unwrap();
        assert_eq!(e.get_password().unwrap(), "00000000000000000000000000000000");
        e.delete_credential().unwrap();
        assert!(matches!(e.get_password(), Err(keyring::Error::NoEntry)));
    }
}
