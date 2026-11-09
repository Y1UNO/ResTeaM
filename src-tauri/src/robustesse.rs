//! Campagne « tout faire planter » (idée de Tom) : chaque analyseur et chaque garde
//! reçoit des milliers d'entrées tirées au hasard (proptest), des fichiers piégés et
//! des volumes énormes. Règle : jamais de plantage, et les gardes de sécurité tiennent
//! toujours (aucun chemin, aucune adresse ne passe s'il ne devait pas). Le rapport est
//! dans `AUDIT-SECURITE-2.md`.

use std::io::Cursor;
use std::time::{Duration, Instant};

use proptest::prelude::*;

use crate::steam::{installation, liens, local, magasin, notes, vdf, workshop};
use crate::{coffre, images_locales, jeu, notifications, salon};

/// Texte qui ressemble à un fichier VDF (guillemets, accolades, barres obliques inverses).
fn texte_vdf() -> impl Strategy<Value = String> {
    proptest::collection::vec(
        prop_oneof![
            Just("\"".to_string()),
            Just("{".to_string()),
            Just("}".to_string()),
            Just("\\".to_string()),
            Just("\n".to_string()),
            Just("\t".to_string()),
            Just("//".to_string()),
            "[a-zA-Z0-9 _é€\u{feff}]{0,6}",
        ],
        0..200,
    )
    .prop_map(|v| v.concat())
}

proptest! {
    #![proptest_config(ProptestConfig { cases: 2000, ..ProptestConfig::default() })]

    // ——— Fichiers de Steam ———

    #[test]
    fn vdf_ne_plante_jamais(s in texte_vdf()) {
        let _ = vdf::lire(&s);
    }

    #[test]
    fn vdf_texte_quelconque(s in any::<String>()) {
        let _ = vdf::lire(&s);
    }

    #[test]
    fn vdf_modifier_reste_lisible(s in texte_vdf(), cle in "[a-zA-Z\"\\\\{} ]{0,12}", valeur in any::<String>()) {
        let chemin = ["A", "B"];
        if let Some(nouveau) = vdf::modifier(&s, &chemin, &cle, &valeur) {
            // Le document modifié se relit sans planter.
            let _ = vdf::lire(&nouveau);
        }
    }

    #[test]
    fn manifestes_workshop_et_captures(s in texte_vdf(), compte in any::<u32>()) {
        let _ = workshop::lire_appworkshop(&s, compte);
        let _ = workshop::lire_captures(&s, None);
        let _ = local::lire_collections_json(&s);
    }

    #[test]
    fn json_de_collections_quelconque(s in any::<String>()) {
        let _ = local::lire_collections_json(&s);
    }

    // ——— Textes venus d'Internet (patch notes, pages du magasin) ———

    #[test]
    fn bbcode_et_html(s in "(\\[/?[a-z*]{0,6}(=[^\\]]{0,10})?\\]|<[/a-z]{0,5}[^>]{0,10}>|&[a-z#0-9]{0,6};|[^\\[<&]{0,10}){0,60}") {
        let _ = notes::trier(&s);
        let _ = notes::version(&s);
        let _ = magasin::texte_brut(&s);
        let _ = magasin::config(&s);
        let _ = magasin::langues(&s);
        let _ = installation::taille_depuis_config(&s);
        let _ = workshop::texte_simple(&s, 300);
    }

    #[test]
    fn textes_quelconques(s in any::<String>()) {
        let _ = notes::trier(&s);
        let _ = magasin::texte_brut(&s);
        let _ = installation::nom_dossier(&s);
        let _ = workshop::texte_simple(&s, 50);
    }

    // ——— Gardes de sécurité : ce qui passe est toujours sûr ———

    #[test]
    fn noms_de_fichiers(s in any::<String>()) {
        if workshop::nom_fichier_valide(&s) {
            prop_assert!(!s.contains(['/', '\\', ':', '\0']));
            prop_assert!(!s.starts_with('.'));
            prop_assert!(s != "..");
        }
        let d = installation::nom_dossier(&s);
        prop_assert!(!d.contains(['/', '\\', ':', '\0', '*', '?', '"', '<', '>', '|']));
        prop_assert!(d != "." && d != "..");
    }

    #[test]
    fn chemins_de_captures(s in "[0-9a-z/._\\\\:]{0,40}") {
        if workshop::chemin_capture_valide(&s) {
            prop_assert!(!s.split('/').any(|p| p == ".." || p == "." || p.is_empty()));
            prop_assert!(!s.contains(['\\', ':']));
        }
    }

    #[test]
    fn plages_d_octets(p in any::<Option<String>>(), total in any::<u64>()) {
        if let Some((a, b)) = images_locales::lire_plage(p.as_deref(), total) {
            prop_assert!(a <= b && b < total);
        }
    }

    #[test]
    fn plages_proches_du_format(a in any::<u64>(), b in any::<Option<u64>>(), total in any::<u64>()) {
        let p = format!("bytes={a}-{}", b.map(|x| x.to_string()).unwrap_or_default());
        if let Some((x, y)) = images_locales::lire_plage(Some(&p), total) {
            prop_assert!(x <= y && y < total);
        }
    }

    #[test]
    fn salon_n_ouvre_que_steam_en_https(s in any::<String>()) {
        if let Some(u) = salon::adresse_depart(&s) {
            prop_assert_eq!(u.scheme(), "https");
            prop_assert!(u.host_str().is_some_and(salon::domaine_steam));
            prop_assert!(u.username().is_empty() && u.password().is_none());
        }
    }

    #[test]
    fn adresses_proches_de_steam(chemin in "[a-z/:@.%-]{0,30}", hote in prop_oneof![
        Just("store.steampowered.com"), Just("steampowered.com.evil.io"), Just("evilsteampowered.com"),
        Just("STORE.STEAMPOWERED.COM"), Just("store.steampowered.com."), Just("xn--stam-rpa.com")
    ], schema in prop_oneof![Just("https"), Just("http"), Just("javascript"), Just("file")]) {
        let s = format!("{schema}://{hote}/{chemin}");
        if let Some(u) = salon::adresse_depart(&s) {
            prop_assert!(u.host_str().is_some_and(salon::domaine_steam));
        }
        if let Some(l) = liens::construire(&liens::ActionSteam::Page { url: s.clone() }) {
            // Rien de brut : ni espace ni guillemet dans le lien envoyé à Steam.
            prop_assert!(!l.contains([' ', '"', '\n']));
            prop_assert!(l.starts_with("steam://openurl/https://"));
        }
    }

    #[test]
    fn liens_steam(lobby in any::<String>(), sid in any::<String>(), adresse in any::<String>()) {
        if let Some(l) = liens::construire(&liens::ActionSteam::RejoindreLobby { app_id: 1, lobby: lobby.clone(), steam_id: sid }) {
            prop_assert!(l.bytes().skip("steam://joinlobby/".len()).all(|b| b.is_ascii_digit() || b == b'/'));
        }
        if let Some(l) = liens::construire(&liens::ActionSteam::RejoindreServeur { adresse }) {
            prop_assert!(l.bytes().skip("steam://connect/".len()).all(|b| b.is_ascii_digit() || b == b'.' || b == b':'));
        }
    }

    #[test]
    fn identite_openid(s in any::<String>()) {
        if let Some(id) = crate::steam::auth::extraire_steam_id(&s) {
            prop_assert!(crate::session::steam_id_valide(&id));
        }
    }

    // ——— Paquets de Wallpaper Engine et coffre-fort ———

    #[test]
    fn paquet_de_scene_quelconque(octets in proptest::collection::vec(any::<u8>(), 0..4096)) {
        if let Some(m) = workshop::lire_scene(Cursor::new(&octets)) {
            prop_assert!(m.debut + m.longueur <= octets.len() as u64);
        }
        let _ = workshop::type_media("x", &octets);
    }

    #[test]
    fn coffre_fort_quelconque(s in any::<String>()) {
        let _ = coffre::lire(&s);
        let _ = coffre::lire(&format!("rstm1:{s}"));
    }

    // ——— Suivi du jeu et notifications ———

    #[test]
    fn transitions_de_jeu(a in any::<Option<u32>>(), b in any::<Option<u32>>(), t in any::<i64>()) {
        let avant = a.map(|id| jeu::SessionJeu { app_id: id, debut: 0, fin: None });
        let (fin, debut) = jeu::transition(avant, b, t);
        prop_assert_eq!(debut.map(|s| s.app_id), if a == b { None } else { b });
        prop_assert_eq!(fin.is_some(), a.is_some() && a != b);
    }

    #[test]
    fn cles_de_promo(id in any::<u32>(), r in any::<u32>(), f in any::<Option<i64>>()) {
        let _ = notifications::cle_promo(id, r, f);
    }
}

// ——— Fichiers piégés (cas fixes) ———

#[test]
fn vdf_imbrique_un_million_de_fois() {
    // Avant la campagne : débordement de pile (plantage). Maintenant : lu en 64 niveaux.
    let profond = "\"a\"{".repeat(1_000_000);
    let t = Instant::now();
    let v = vdf::lire(&profond);
    let mut n = &v;
    let mut niveaux = 0;
    while let Some(suivant) = n.get("a") {
        n = suivant;
        niveaux += 1;
    }
    assert!(niveaux <= vdf::PROFONDEUR_MAX);
    assert!(t.elapsed() < Duration::from_secs(5));
    let _ = vdf::modifier(&profond, &["a", "a"], "x", "y");
}

#[test]
fn vdf_chaines_jamais_fermees_et_accolades_orphelines() {
    for s in ["\"", "\"a", "\"a\" \"", "}}}}", "{{{{", "\"a\"{\"b\"", "\\\"", "\"a\\", "\u{feff}\"a\"\"b\""] {
        let _ = vdf::lire(s);
        let _ = vdf::modifier(s, &["a"], "k", "v");
    }
}

#[test]
fn paquet_de_scene_piege() {
    // Table annonçant 20 000 fichiers, mais tronquée : rien n'est lu au-delà du fichier.
    let mut p = 8u32.to_le_bytes().to_vec();
    p.extend_from_slice(b"PKGV0024");
    p.extend_from_slice(&20_000u32.to_le_bytes());
    for i in 0..10u32 {
        let nom = format!("materials/{i}.tex");
        p.extend_from_slice(&(nom.len() as u32).to_le_bytes());
        p.extend_from_slice(nom.as_bytes());
        p.extend_from_slice(&u32::MAX.to_le_bytes());
        p.extend_from_slice(&u32::MAX.to_le_bytes());
    }
    assert_eq!(workshop::lire_scene(Cursor::new(&p)), None);
    // Nom de fichier annoncé à 4 Go : refusé sans rien allouer.
    let mut p = 8u32.to_le_bytes().to_vec();
    p.extend_from_slice(b"PKGV0024");
    p.extend_from_slice(&1u32.to_le_bytes());
    p.extend_from_slice(&u32::MAX.to_le_bytes());
    assert_eq!(workshop::lire_scene(Cursor::new(&p)), None);
}

#[test]
fn plages_geantes_ou_negatives() {
    for p in ["bytes=-1", "bytes=-", "bytes=18446744073709551615-", "bytes=5-2", "bytes=0-0,1-2", "octets=0-1", "bytes= 1 - 2 ", "bytes=99999999999999999999-"] {
        if let Some((a, b)) = images_locales::lire_plage(Some(p), 100) {
            assert!(a <= b && b < 100, "{p}");
        }
    }
    assert_eq!(images_locales::lire_plage(Some("bytes=0-"), 0), None);
}

#[test]
fn chemins_windows_et_encodes() {
    for n in ["..", "../a", "..\\a", "C:a", "a/b", "%2e%2e", "\0", ".git", "CON", "a:b"] {
        if workshop::nom_fichier_valide(n) {
            // Seuls les noms sans séparateur passent ; « %2e%2e » et « CON » restent des noms
            // simples dans le dossier de l'objet (jamais décodés en chemin).
            assert!(!n.contains(['/', '\\', ':']), "{n}");
        }
    }
    for c in ["../../windows/system.ini", "760/../../a.jpg", "C:/x.jpg", "1/screenshots/..\\a.jpg", "1/screenshots/a.jpg/"] {
        assert!(!workshop::chemin_capture_valide(c), "{c}");
    }
}

// ——— Charge ———

#[test]
fn bibliotheque_de_5000_jeux() {
    let mut s = String::from("\"libraryfolders\"\n{\n\t\"0\"\n\t{\n\t\t\"path\"\t\t\"C:\\\\Steam\"\n\t\t\"apps\"\n\t\t{\n");
    for i in 0..5000 {
        s.push_str(&format!("\t\t\t\"{i}\"\t\t\"{}\"\n", i * 1000));
    }
    s.push_str("\t\t}\n\t}\n}\n");
    let t = Instant::now();
    let v = vdf::lire(&s);
    assert_eq!(v.get("libraryfolders").and_then(|l| l.get("0")).and_then(|z| z.get("apps")).map(|a| a.paires().len()), Some(5000));
    assert!(t.elapsed() < Duration::from_secs(1), "{:?}", t.elapsed());
}

#[test]
fn mille_mods_dans_appworkshop() {
    let mut s = String::from("\"AppWorkshop\"\n{\n\t\"appid\"\t\t\"431960\"\n\t\"WorkshopItemsInstalled\"\n\t{\n");
    for i in 0..1000 {
        s.push_str(&format!("\t\t\"{}\"\n\t\t{{\n\t\t\t\"size\"\t\t\"{i}\"\n\t\t\t\"timeupdated\"\t\t\"1\"\n\t\t}}\n", 100_000 + i));
    }
    s.push_str("\t}\n\t\"WorkshopItemDetails\"\n\t{\n");
    for i in 0..1000 {
        s.push_str(&format!("\t\t\"{}\"\n\t\t{{\n\t\t\t\"subscribedby\"\t\t\"7\"\n\t\t}}\n", 100_000 + i));
    }
    s.push_str("\t}\n}\n");
    let t = Instant::now();
    let _ = workshop::lire_appworkshop(&s, 7);
    assert!(t.elapsed() < Duration::from_secs(1), "{:?}", t.elapsed());
}

#[test]
fn texte_enorme() {
    // 20 Mo de patch notes : traité sans planter, en un temps raisonnable.
    let s = "[h1]Correctifs[/h1][list][*]Bug[/list]".repeat(500_000);
    let t = Instant::now();
    let _ = notes::trier(&s);
    assert!(t.elapsed() < Duration::from_secs(20), "{:?}", t.elapsed());
}

#[test]
fn bbcode_jamais_ferme() {
    // Trouvés par la campagne : plantaient (coupure au milieu d'un caractère, ou « [ » final).
    assert_eq!(workshop::texte_simple("Fond [ெ", 50), "Fond [ெ");
    assert_eq!(workshop::texte_simple("[", 50), "[");
    assert_eq!(workshop::texte_simple("a [b] c [img]x[/img] d", 50), "a c d");
}
