//! Notes par jeu (idée de Tom) : un petit bloc-notes personnel sur la fiche de
//! chaque jeu (où il en est, ses builds, ses codes, ses astuces). Gardé dans le
//! cache, **chiffré par le coffre-fort**, sans date de péremption. Rien n'est
//! envoyé nulle part.

use crate::cache::Cache;
use crate::erreur::{Erreur, Resultat};

/// Les notes ne se périment pas (20 ans).
const TTL_NOTES: i64 = 20 * 365 * 86_400;
/// Taille maximale d'une note, en caractères.
pub const TAILLE_MAX: usize = 20_000;

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteJeu {
    pub texte: String,
    /// Dernière modification, en millisecondes.
    pub modifie_le: i64,
}

fn cle(app_id: u32) -> String {
    format!("notes:{app_id}")
}

fn valider(app_id: u32) -> Resultat<()> {
    if app_id == 0 {
        return Err(Erreur::Interne("jeu invalide".into()));
    }
    Ok(())
}

/// Note d'un jeu (`None` s'il n'y en a pas).
pub fn lire(cache: &Cache, app_id: u32) -> Resultat<Option<NoteJeu>> {
    valider(app_id)?;
    cache.frais(&cle(app_id))
}

/// Enregistre la note. Une note vide (ou faite d'espaces) est effacée.
/// Les caractères de contrôle (sauf retour à la ligne et tabulation) sont retirés.
pub fn ecrire(cache: &Cache, app_id: u32, texte: &str, maintenant: i64) -> Resultat<Option<NoteJeu>> {
    valider(app_id)?;
    if texte.chars().count() > TAILLE_MAX {
        return Err(Erreur::Interne(format!("la note dépasse {TAILLE_MAX} caractères")));
    }
    let propre: String = texte.chars().filter(|c| !c.is_control() || *c == '\n' || *c == '\t').collect();
    if propre.trim().is_empty() {
        cache.retirer(&cle(app_id))?;
        return Ok(None);
    }
    let note = NoteJeu { texte: propre, modifie_le: maintenant };
    cache.ranger(&cle(app_id), &note, TTL_NOTES)?;
    Ok(Some(note))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ecriture_lecture_effacement() {
        let c = Cache::en_memoire().unwrap();
        assert_eq!(lire(&c, 730).unwrap(), None);
        let n = ecrire(&c, 730, "Acte 2, build saignement\r\ncode : ABC\u{0}", 1_000).unwrap().unwrap();
        assert_eq!(n.texte, "Acte 2, build saignement\ncode : ABC");
        assert_eq!(lire(&c, 730).unwrap(), Some(n));
        // Un autre jeu n'est pas touché.
        assert_eq!(lire(&c, 570).unwrap(), None);
        // Une note vide est effacée.
        assert_eq!(ecrire(&c, 730, "  \n ", 2_000).unwrap(), None);
        assert_eq!(lire(&c, 730).unwrap(), None);
    }

    #[test]
    fn limites() {
        let c = Cache::en_memoire().unwrap();
        assert!(ecrire(&c, 0, "x", 1).is_err());
        assert!(lire(&c, 0).is_err());
        // 20 000 caractères (même accentués) passent, un de plus est refusé.
        assert!(ecrire(&c, 730, &"é".repeat(TAILLE_MAX), 1).is_ok());
        assert!(ecrire(&c, 730, &"é".repeat(TAILLE_MAX + 1), 1).is_err());
        assert_eq!(lire(&c, 730).unwrap().unwrap().texte.chars().count(), TAILLE_MAX);
    }
}
