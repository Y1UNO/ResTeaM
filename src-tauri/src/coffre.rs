//! Coffre-fort : ce que ResTeaM garde sur le disque (session, valeurs du cache SQLite,
//! dont la file d'attente de Steam) est chiffré avec la protection de données de
//! Windows (DPAPI, `CryptProtectData`, portée « utilisateur courant ») : seule la
//! session Windows de Tom peut le relire. Rien à retenir, aucune clé stockée par ResTeaM.
//!
//! Format texte : `rstm1:` puis le bloc chiffré en base64. Un ancien texte en clair
//! (avant le coffre-fort) reste lisible, et il est chiffré à sa prochaine écriture.
//! La clé API, elle, reste dans le Gestionnaire d'identifiants Windows.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;

use crate::erreur::{Erreur, Resultat};

const ENTETE: &str = "rstm1:";
/// Sel propre à ResTeaM : un autre programme de la même session ne peut pas
/// déchiffrer ces blocs par hasard (il lui faudrait connaître ce sel).
const SEL: &[u8] = b"ResTeaM coffre-fort v1";

/// Chiffre un texte (DPAPI) et le rend sous forme de texte `rstm1:…`.
pub fn chiffrer(clair: &str) -> Resultat<String> {
    let bloc = proteger(clair.as_bytes())?;
    Ok(format!("{ENTETE}{}", STANDARD.encode(bloc)))
}

/// Relit un texte : déchiffré s'il vient du coffre-fort, tel quel s'il est en clair
/// (ancien format). `None` si le bloc ne peut pas être déchiffré (autre session Windows,
/// fichier abîmé).
pub fn lire(texte: &str) -> Option<String> {
    let Some(b64) = texte.strip_prefix(ENTETE) else { return Some(texte.to_string()) };
    let bloc = STANDARD.decode(b64.trim()).ok()?;
    String::from_utf8(ouvrir(&bloc)?).ok()
}

/// Le texte est-il déjà chiffré ?
pub fn est_chiffre(texte: &str) -> bool {
    texte.starts_with(ENTETE)
}

#[cfg(windows)]
fn proteger(clair: &[u8]) -> Resultat<Vec<u8>> {
    use windows_sys::Win32::Security::Cryptography::{CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptProtectData};
    let entree = CRYPT_INTEGER_BLOB { cbData: u32::try_from(clair.len()).map_err(|_| Erreur::Interne("donnée trop grande".into()))?, pbData: clair.as_ptr() as *mut u8 };
    let sel = CRYPT_INTEGER_BLOB { cbData: SEL.len() as u32, pbData: SEL.as_ptr() as *mut u8 };
    let mut sortie = CRYPT_INTEGER_BLOB::default();
    // SAFETY : les blocs d'entrée pointent sur des tranches vivantes pendant l'appel ;
    // la sortie est allouée par Windows et libérée par `copier_et_liberer`.
    let ok = unsafe { CryptProtectData(&entree, std::ptr::null(), &sel, std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut sortie) };
    if ok == 0 {
        return Err(Erreur::Interne("chiffrement Windows (DPAPI) refusé".into()));
    }
    Ok(copier_et_liberer(sortie))
}

#[cfg(windows)]
fn ouvrir(bloc: &[u8]) -> Option<Vec<u8>> {
    use windows_sys::Win32::Security::Cryptography::{CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptUnprotectData};
    let entree = CRYPT_INTEGER_BLOB { cbData: u32::try_from(bloc.len()).ok()?, pbData: bloc.as_ptr() as *mut u8 };
    let sel = CRYPT_INTEGER_BLOB { cbData: SEL.len() as u32, pbData: SEL.as_ptr() as *mut u8 };
    let mut sortie = CRYPT_INTEGER_BLOB::default();
    // SAFETY : comme `proteger`.
    let ok = unsafe { CryptUnprotectData(&entree, std::ptr::null_mut(), &sel, std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut sortie) };
    (ok != 0).then(|| copier_et_liberer(sortie))
}

#[cfg(windows)]
fn copier_et_liberer(b: windows_sys::Win32::Security::Cryptography::CRYPT_INTEGER_BLOB) -> Vec<u8> {
    if b.pbData.is_null() {
        return Vec::new();
    }
    // SAFETY : `pbData` / `cbData` décrivent le bloc alloué par Windows (LocalAlloc),
    // copié puis rendu avec `LocalFree`, comme le demande la documentation de DPAPI.
    unsafe {
        let v = std::slice::from_raw_parts(b.pbData, b.cbData as usize).to_vec();
        windows_sys::Win32::Foundation::LocalFree(b.pbData as _);
        v
    }
}

#[cfg(not(windows))]
fn proteger(_: &[u8]) -> Resultat<Vec<u8>> {
    Err(Erreur::Interne("coffre-fort : Windows uniquement".into()))
}

#[cfg(not(windows))]
fn ouvrir(_: &[u8]) -> Option<Vec<u8>> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aller_retour() {
        let t = chiffrer("{\"steamId\":\"76561198000000000\"}").unwrap();
        assert!(est_chiffre(&t));
        assert!(!t.contains("7656119"), "le texte chiffré ne laisse rien voir");
        assert_eq!(lire(&t).as_deref(), Some("{\"steamId\":\"76561198000000000\"}"));
        // Deux chiffrements du même texte diffèrent (DPAPI sale chaque bloc).
        assert_ne!(chiffrer("a").unwrap(), chiffrer("a").unwrap());
        assert_eq!(lire(&chiffrer("").unwrap()).as_deref(), Some(""));
    }

    #[test]
    fn ancien_format_et_blocs_abimes() {
        assert_eq!(lire("{\"x\":1}").as_deref(), Some("{\"x\":1}"));
        assert_eq!(lire("rstm1:pas du base64 !"), None);
        assert_eq!(lire("rstm1:AAAA"), None);
        // Un octet changé dans la partie chiffrée (fin du bloc, signée par Windows) : refusé.
        let t = chiffrer("secret").unwrap();
        let mut bloc = STANDARD.decode(&t[ENTETE.len()..]).unwrap();
        let i = bloc.len() - 10;
        bloc[i] ^= 0x5A;
        assert_eq!(lire(&format!("{ENTETE}{}", STANDARD.encode(bloc))), None, "un bloc modifié est refusé");
    }
}
