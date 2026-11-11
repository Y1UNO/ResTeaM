//! Journal des sessions de jeu (idée de Tom) : chaque partie suivie par `jeu.rs`
//! (jeu, début, fin) est gardée dans le cache, **chiffré par le coffre-fort**,
//! rangée par mois (`journal:2026-11`). Il nourrira aussi le ResTeaM Wrap.
//!
//! Pendant une partie, la session « en cours » est notée toutes les minutes : si
//! ResTeaM se ferme ou redémarre au milieu, elle est reprise (le jeu tourne encore)
//! ou enregistrée jusqu'à la dernière minute vue (le jeu est fermé).

use crate::cache::Cache;
use crate::erreur::Resultat;
use crate::jeu::SessionJeu;

const CLE_EN_COURS: &str = "journal:en-cours";
/// Le journal ne se périme pas (20 ans).
const TTL_JOURNAL: i64 = 20 * 365 * 86_400;
/// Une session plus courte n'est pas gardée (lancement raté, écran de mise à jour).
pub const DUREE_MIN_MS: i64 = 60_000;
/// Au plus, par mois (garde-fou).
const MAX_PAR_MOIS: usize = 5_000;

/// Année et mois (UTC) d'un instant en millisecondes : algorithme de date civile
/// (jours depuis 1970 → année, mois), sans dépendance.
pub fn annee_mois(ms: i64) -> (i64, u32) {
    let jours = ms.div_euclid(86_400_000);
    let z = jours + 719_468;
    let ere = z.div_euclid(146_097);
    let doe = z - ere * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let mois = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let annee = yoe + ere * 400 + i64::from(mois <= 2);
    (annee, mois)
}

fn cle(annee: i64, mois: u32) -> String {
    format!("journal:{annee:04}-{mois:02}")
}

/// Garde une session terminée (doublons et sessions trop courtes ignorés).
/// Renvoie `true` si elle a été ajoutée.
pub fn enregistrer(cache: &Cache, s: SessionJeu) -> Resultat<bool> {
    let Some(fin) = s.fin else { return Ok(false) };
    if fin.saturating_sub(s.debut) < DUREE_MIN_MS {
        return Ok(false);
    }
    let (a, m) = annee_mois(s.debut);
    let k = cle(a, m);
    let mut liste: Vec<SessionJeu> = cache.frais(&k)?.unwrap_or_default();
    if liste.iter().any(|x| x.app_id == s.app_id && x.debut == s.debut) {
        return Ok(false);
    }
    liste.push(s);
    if liste.len() > MAX_PAR_MOIS {
        liste.remove(0);
    }
    cache.ranger(&k, &liste, TTL_JOURNAL)?;
    Ok(true)
}

/// Sessions commencées entre `depuis` et `jusqu` (millisecondes), dans l'ordre.
pub fn lire(cache: &Cache, depuis: i64, jusqu: i64) -> Resultat<Vec<SessionJeu>> {
    let (mut a, mut m) = annee_mois(depuis.max(0));
    let (af, mf) = annee_mois(jusqu.max(depuis));
    let mut toutes = Vec::new();
    // 240 mois au plus (20 ans).
    for _ in 0..240 {
        let liste: Vec<SessionJeu> = cache.frais(&cle(a, m))?.unwrap_or_default();
        toutes.extend(liste.into_iter().filter(|s| s.debut >= depuis && s.debut <= jusqu));
        if (a, m) >= (af, mf) {
            break;
        }
        (a, m) = if m == 12 { (a + 1, 1) } else { (a, m + 1) };
    }
    toutes.sort_by_key(|s| s.debut);
    Ok(toutes)
}

/// Note la session en cours (sa « fin » est la dernière minute vue).
pub fn garder_en_cours(cache: &Cache, s: SessionJeu, maintenant: i64) -> Resultat<()> {
    cache.ranger(CLE_EN_COURS, &SessionJeu { fin: Some(maintenant), ..s }, TTL_JOURNAL)
}

pub fn lire_en_cours(cache: &Cache) -> Option<SessionJeu> {
    cache.frais::<SessionJeu>(CLE_EN_COURS).ok().flatten()
}

pub fn oublier_en_cours(cache: &Cache) -> Resultat<()> {
    cache.retirer(CLE_EN_COURS)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dates_civiles() {
        assert_eq!(annee_mois(0), (1970, 1));
        assert_eq!(annee_mois(1_794_268_800_000), (2026, 11)); // 10 novembre 2026
        assert_eq!(annee_mois(951_782_400_000), (2000, 2)); // 29 février 2000
        assert_eq!(annee_mois(951_868_800_000), (2000, 3)); // 1er mars 2000
        assert_eq!(annee_mois(1_798_761_599_000), (2026, 12)); // 31 décembre 2026, 23:59:59
        assert_eq!(annee_mois(1_798_761_600_000), (2027, 1));
    }

    #[test]
    fn enregistrement_et_lecture() {
        let c = Cache::en_memoire().unwrap();
        let s = |id, debut: i64, minutes: i64| SessionJeu { app_id: id, debut, fin: Some(debut + minutes * 60_000) };
        let oct = 1_790_000_000_000; // octobre 2026
        let nov = 1_794_268_800_000; // novembre 2026
        enregistrer(&c, s(730, oct, 90)).unwrap();
        enregistrer(&c, s(570, nov, 30)).unwrap();
        enregistrer(&c, s(570, nov, 30)).unwrap(); // doublon
        enregistrer(&c, s(1, nov + 10, 0)).unwrap(); // trop courte
        enregistrer(&c, SessionJeu { app_id: 2, debut: nov, fin: None }).unwrap(); // pas finie
        let tout = lire(&c, oct - 1, nov + 1).unwrap();
        assert_eq!(tout.iter().map(|x| x.app_id).collect::<Vec<_>>(), vec![730, 570]);
        assert_eq!(lire(&c, nov - 1, nov + 1).unwrap().len(), 1);
        // Session en cours notée, puis oubliée.
        garder_en_cours(&c, SessionJeu { app_id: 9, debut: nov, fin: None }, nov + 120_000).unwrap();
        assert_eq!(lire_en_cours(&c).and_then(|x| x.fin), Some(nov + 120_000));
        oublier_en_cours(&c).unwrap();
        assert_eq!(lire_en_cours(&c), None);
    }
}
