//! Patch notes : nettoyage du BBCode / HTML des annonces Steam, découpage en
//! éléments (listes, sous-listes) et tri automatique par catégorie
//! (Nouveau, Équilibrage, Performances, Correctifs, Autre — kit/FONCTIONNALITES.md).

use serde::{Deserialize, Serialize};

use super::webapi::Actu;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Categorie {
    Nouveau,
    Equilibrage,
    Performances,
    Correctifs,
    Autre,
}

/// Ordre d'affichage des sections.
const ORDRE: [Categorie; 5] = [
    Categorie::Nouveau,
    Categorie::Equilibrage,
    Categorie::Performances,
    Categorie::Correctifs,
    Categorie::Autre,
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Element {
    pub texte: String,
    /// Sous-points (listes imbriquées).
    pub sous: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Section {
    pub categorie: Categorie,
    pub elements: Vec<Element>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchNotes {
    pub id: String,
    pub titre: String,
    pub url: String,
    pub date: i64,
    pub version: Option<String>,
    /// Étiquetée « patchnotes » par l'éditeur (sinon : dernière annonce officielle).
    pub patch: bool,
    pub sections: Vec<Section>,
}

const LONGUEUR_MAX: usize = 280;
const ELEMENTS_MAX: usize = 60;

// ——— 1. Découpage du texte en blocs ———

#[derive(Debug, Clone, PartialEq)]
enum Bloc {
    Titre(String),
    Paragraphe(String),
    Point { texte: String, profondeur: u8 },
}

#[derive(PartialEq, Clone, Copy)]
enum Genre {
    Paragraphe,
    Titre,
    Point(u8),
}

struct Decoupeur {
    blocs: Vec<Bloc>,
    tampon: String,
    genre: Genre,
    profondeur: u8,
}

impl Decoupeur {
    fn vider(&mut self) {
        let texte = nettoyer_espaces(&decoder_entites(&self.tampon));
        self.tampon.clear();
        if texte.is_empty() || texte.chars().all(|c| !c.is_alphanumeric()) {
            self.genre = Genre::Paragraphe;
            return;
        }
        self.blocs.push(match self.genre {
            Genre::Titre => Bloc::Titre(texte),
            Genre::Point(p) => Bloc::Point { texte: sans_puce(&texte).to_string(), profondeur: p },
            Genre::Paragraphe => {
                // Lignes « - texte », « • texte » ou « · texte » écrites à la main.
                let reste = sans_puce(&texte);
                if reste.len() < texte.len() {
                    Bloc::Point { texte: reste.to_string(), profondeur: 1 }
                } else {
                    Bloc::Paragraphe(texte)
                }
            }
        });
        self.genre = Genre::Paragraphe;
    }

    /// Saut de ligne : coupe un paragraphe, mais pas un point de liste.
    fn saut(&mut self) {
        if matches!(self.genre, Genre::Point(_)) {
            self.tampon.push(' ');
        } else {
            self.vider();
        }
    }
}

/// Retire une puce tapée à la main en début de ligne.
fn sans_puce(s: &str) -> &str {
    let r = s.trim_start_matches(['-', '•', '·', '*', '–', '—', '●', '▪']);
    if r.len() < s.len() && r.starts_with(' ') { r.trim_start() } else { s }
}

fn nettoyer_espaces(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub(crate) fn decoder_entites(s: &str) -> String {
    let mut sortie = String::with_capacity(s.len());
    let mut reste = s;
    while let Some(i) = reste.find('&') {
        sortie.push_str(&reste[..i]);
        let apres = &reste[i..];
        let fin = apres.find(';').filter(|&f| f <= 10);
        let remplace = fin.and_then(|f| {
            let nom = &apres[1..f];
            let c = match nom {
                "amp" => Some('&'),
                "lt" => Some('<'),
                "gt" => Some('>'),
                "quot" => Some('"'),
                "apos" | "#39" => Some('\''),
                "nbsp" => Some(' '),
                _ => nom
                    .strip_prefix("#x")
                    .and_then(|h| u32::from_str_radix(h, 16).ok())
                    .or_else(|| nom.strip_prefix('#').and_then(|d| d.parse().ok()))
                    .and_then(char::from_u32),
            };
            c.map(|c| (c, f))
        });
        match remplace {
            Some((c, f)) => {
                sortie.push(c);
                reste = &apres[f + 1..];
            }
            None => {
                sortie.push('&');
                reste = &apres[1..];
            }
        }
    }
    sortie.push_str(reste);
    sortie
}

/// Balises dont tout le contenu est ignoré (images, vidéos).
const A_SAUTER: &[&str] = &["img", "previewyoutube", "video", "dynamiclink"];

fn decouper(source: &str) -> Vec<Bloc> {
    let mut d = Decoupeur { blocs: vec![], tampon: String::new(), genre: Genre::Paragraphe, profondeur: 0 };
    let mut i = 0;
    let octets = source.as_bytes();
    while i < source.len() {
        let c = octets[i];
        if c == b'[' || c == b'<' {
            let fermant = if c == b'[' { ']' } else { '>' };
            if let Some(f) = source[i + 1..].find(fermant).map(|f| f + i + 1) {
                let brut = &source[i + 1..f];
                // Une vraie balise : courte, sans saut de ligne.
                if brut.len() <= 300 && !brut.contains('\n') && !brut.is_empty() {
                    let fermeture = brut.starts_with('/');
                    let nom: String = brut
                        .trim_start_matches('/')
                        .chars()
                        .take_while(|c| c.is_ascii_alphanumeric() || *c == '*')
                        .collect::<String>()
                        .to_ascii_lowercase();
                    if !nom.is_empty() {
                        i = f + 1;
                        if !fermeture && A_SAUTER.contains(&nom.as_str()) && !brut.ends_with('/') {
                            // Saute jusqu'à la balise fermante, si elle existe.
                            let fin = format!("{}/{}", c as char, nom);
                            if let Some(p) = source[i..].to_ascii_lowercase().find(&fin) {
                                let apres = source[i + p..].find(fermant).map(|x| x + i + p + 1);
                                i = apres.unwrap_or(source.len());
                            }
                            continue;
                        }
                        match (nom.as_str(), fermeture) {
                            ("h1" | "h2" | "h3" | "h4", false) => {
                                d.vider();
                                d.genre = Genre::Titre;
                            }
                            ("h1" | "h2" | "h3" | "h4", true) => d.vider(),
                            ("list" | "olist" | "ul" | "ol", false) => {
                                d.vider();
                                d.profondeur = d.profondeur.saturating_add(1);
                            }
                            ("list" | "olist" | "ul" | "ol", true) => {
                                d.vider();
                                d.profondeur = d.profondeur.saturating_sub(1);
                            }
                            ("*" | "li", false) => {
                                d.vider();
                                d.genre = Genre::Point(d.profondeur.max(1));
                            }
                            ("*" | "li", true) => d.vider(),
                            ("p" | "br" | "hr" | "div" | "tr" | "table", _) => d.saut(),
                            _ => {} // Mise en forme (b, i, u, url, a, strong…) : on garde le texte.
                        }
                        continue;
                    }
                }
            }
        }
        if c == b'\n' {
            d.saut();
            i += 1;
            continue;
        }
        // `{STEAM_CLAN_IMAGE}/…` hors balise : on saute jusqu'à l'espace.
        if source[i..].starts_with("{STEAM_CLAN_IMAGE}") {
            i += source[i..].find(char::is_whitespace).unwrap_or(source.len() - i);
            continue;
        }
        let ch = source[i..].chars().next().unwrap_or(' ');
        d.tampon.push(ch);
        i += ch.len_utf8();
    }
    d.vider();
    d.blocs
}

// ——— 2. Classement par mots-clés ———

fn mots(texte: &str) -> Vec<String> {
    texte
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|m| !m.is_empty())
        .map(str::to_string)
        .collect()
}

/// (catégorie, mots exacts, débuts de mots). L'ordre fixe la priorité :
/// « Fixed a crash when loading » est un correctif, pas une perf.
const REGLES: &[(Categorie, &[&str], &[&str])] = &[
    (
        Categorie::Correctifs,
        &["bug", "bugs", "issue", "issues", "lag"],
        &["fix", "crash", "resolv", "corrig", "correctif", "correction", "plantage", "glitch", "exploit", "softlock"],
    ),
    (
        Categorie::Performances,
        &["fps", "memory", "mémoire"],
        &["perform", "optimi", "loading", "chargement", "stutter", "framerate", "latenc"],
    ),
    (
        Categorie::Equilibrage,
        &[],
        &["balanc", "rebalanc", "buff", "nerf", "adjust", "tweak", "équilibr", "ajust", "increas", "decreas", "reduc"],
    ),
    (
        Categorie::Nouveau,
        &["new", "added", "add", "adds", "adding", "nouveau", "nouvelle", "nouveaux", "nouvelles"],
        &["introduc", "ajout"],
    ),
];

pub fn classer(texte: &str) -> Option<Categorie> {
    let m = mots(texte);
    REGLES.iter().find_map(|(cat, exacts, debuts)| {
        m.iter()
            .any(|w| exacts.contains(&w.as_str()) || debuts.iter().any(|d| w.starts_with(d)))
            .then_some(*cat)
    })
}

fn tronquer(s: &str) -> String {
    if s.chars().count() <= LONGUEUR_MAX {
        return s.to_string();
    }
    let coupe: String = s.chars().take(LONGUEUR_MAX).collect();
    let coupe = coupe.rsplit_once(' ').map(|(a, _)| a).unwrap_or(&coupe);
    format!("{}…", coupe.trim_end_matches([',', ';', ':', '.']))
}

/// Une ligne courte qui se termine par « : » (« Enemies: ») ou écrite en
/// majuscules (« MAP CHANGE ») sert de sous-titre.
fn est_sous_titre(texte: &str) -> bool {
    let n = texte.chars().count();
    let lettres: Vec<char> = texte.chars().filter(|c| c.is_alphabetic()).collect();
    let majuscules = lettres.len() >= 3 && lettres.iter().all(|c| c.is_uppercase());
    (texte.ends_with(':') && n <= 60) || (majuscules && n <= 40)
}

/// Découpe et trie le contenu d'une annonce.
pub fn trier(contenu: &str) -> Vec<Section> {
    let blocs = decouper(contenu);
    let nb_points = blocs.iter().filter(|b| matches!(b, Bloc::Point { .. })).count();
    // Avec de vraies listes, les paragraphes sont l'intro et la conclusion : on les écarte.
    let garder_paragraphes = nb_points < 3;

    let mut elements: Vec<(Categorie, Element)> = Vec::new();
    let mut cat_titre: Option<Categorie> = None;
    let mut cat_sous_titre: Option<Categorie> = None;
    // Index du dernier point de premier niveau, pour y rattacher les sous-points.
    let mut parent: Option<usize> = None;

    for b in blocs {
        match b {
            Bloc::Titre(t) => {
                cat_titre = classer(&t);
                cat_sous_titre = None;
                parent = None;
            }
            Bloc::Paragraphe(t) if est_sous_titre(&t) => {
                cat_sous_titre = classer(&t);
                parent = None;
            }
            Bloc::Paragraphe(t) => {
                parent = None;
                if garder_paragraphes {
                    let cat = classer(&t).or(cat_sous_titre).or(cat_titre).unwrap_or(Categorie::Autre);
                    elements.push((cat, Element { texte: tronquer(&t), sous: vec![] }));
                }
            }
            Bloc::Point { texte, profondeur } => {
                if profondeur > 1 {
                    if let Some(p) = parent {
                        elements[p].1.sous.push(tronquer(&texte));
                        continue;
                    }
                }
                let cat = classer(&texte).or(cat_sous_titre).or(cat_titre).unwrap_or(Categorie::Autre);
                elements.push((cat, Element { texte: tronquer(&texte), sous: vec![] }));
                parent = Some(elements.len() - 1);
            }
        }
    }
    elements.truncate(ELEMENTS_MAX);

    ORDRE
        .iter()
        .filter_map(|cat| {
            let liste: Vec<Element> = elements.iter().filter(|(c, _)| c == cat).map(|(_, e)| e.clone()).collect();
            (!liste.is_empty()).then_some(Section { categorie: *cat, elements: liste })
        })
        .collect()
}

/// Numéro de version dans un titre : « v0.111.0 » → « 0.111.0 », « Patch 1.2 » → « 1.2 ».
pub fn version(titre: &str) -> Option<String> {
    titre
        .split(|c: char| c.is_whitespace() || matches!(c, '(' | ')' | '[' | ']' | ',' | ':' | '-'))
        .map(|m| m.trim_start_matches(['v', 'V']).trim_end_matches('.'))
        .find(|m| {
            let parts: Vec<&str> = m.split('.').collect();
            parts.len() >= 2 && parts.iter().all(|p| !p.is_empty() && p.len() <= 6 && p.bytes().all(|b| b.is_ascii_digit()))
        })
        .map(str::to_string)
}

/// Choisit l'annonce à afficher (la plus récente étiquetée « patchnotes », sinon
/// la plus récente) et la transforme en patch notes triées.
/// Une annonce de l'historique (fiche d'un jeu) : notes triées, sinon un extrait du texte,
/// et la première image de l'annonce.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnonceJeu {
    #[serde(flatten)]
    pub notes: PatchNotes,
    pub image: Option<String>,
    /// Texte brut (500 caractères au plus) quand l'annonce n'a pas de liste de notes.
    pub extrait: Option<String>,
}

pub fn annonce(a: &Actu) -> AnnonceJeu {
    let sections = trier(&a.contenu);
    let extrait = sections.is_empty().then(|| super::workshop::texte_simple(&a.contenu, 500)).filter(|t| !t.is_empty());
    AnnonceJeu {
        notes: PatchNotes { id: a.id.clone(), titre: a.titre.clone(), url: a.url.clone(), date: a.date, version: version(&a.titre), patch: a.patch, sections },
        image: premiere_image(&a.contenu),
        extrait,
    }
}

/// Première image d'une annonce (`[img]…[/img]` ou `[img src="…"]`), seulement sur les
/// serveurs d'images de Steam (en HTTPS).
pub fn premiere_image(contenu: &str) -> Option<String> {
    let brut = if let Some(i) = contenu.find("[img]") {
        let reste = &contenu[i + 5..];
        reste[..reste.find("[/img]")?].trim().to_string()
    } else {
        let i = contenu.find("[img src=\"")?;
        let reste = &contenu[i + 10..];
        reste[..reste.find('"')?].trim().to_string()
    };
    let adresse = brut.replace("{STEAM_CLAN_IMAGE}", "https://clan.akamai.steamstatic.com/images");
    let u = url::Url::parse(&adresse).ok()?;
    let hote = u.host_str()?;
    (u.scheme() == "https" && (hote.ends_with(".steamstatic.com") || hote.ends_with(".akamaihd.net"))).then(|| u.to_string())
}

pub fn depuis_actus(actus: &[Actu]) -> Option<PatchNotes> {
    let a = actus
        .iter()
        .filter(|a| a.patch)
        .max_by_key(|a| a.date)
        .or_else(|| actus.iter().max_by_key(|a| a.date))?;
    Some(PatchNotes {
        id: a.id.clone(),
        titre: a.titre.clone(),
        url: a.url.clone(),
        date: a.date,
        version: version(&a.titre),
        patch: a.patch,
        sections: trier(&a.contenu),
    })
}

#[cfg(test)]
mod tests_historique {
    use super::*;

    #[test]
    fn images_des_annonces() {
        assert_eq!(
            premiere_image("x [img]{STEAM_CLAN_IMAGE}/449/ab.gif[/img] y").as_deref(),
            Some("https://clan.akamai.steamstatic.com/images/449/ab.gif")
        );
        assert_eq!(
            premiere_image("[img src=\"https://clan.akamai.steamstatic.com/images/1/a.png\"][/img]").as_deref(),
            Some("https://clan.akamai.steamstatic.com/images/1/a.png")
        );
        // Ailleurs que chez Steam, ou sans HTTPS : refusé.
        assert_eq!(premiere_image("[img]https://evil.io/a.png[/img]"), None);
        assert_eq!(premiere_image("[img]http://clan.akamai.steamstatic.com/a.png[/img]"), None);
        assert_eq!(premiere_image("[img]javascript:alert(1)[/img]"), None);
        assert_eq!(premiere_image("[img] sans fin"), None);
        assert_eq!(premiere_image("rien"), None);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Extrait réel (Slay the Spire 2, bêta v0.111.0).
    const STS2: &str = "Time for another beta patch! Heads up that there won't be a patch on the 27th.\n\n\
In the meantime, let's look at some of this update's highlights. First off, there are balance changes.\n\n\
[img]{STEAM_CLAN_IMAGE}/44971832/9db1f13e88c7634759e235f7bbb9ce29abe656bb.gif[/img]\n\
We look forward to hearing all of your feedback!\n\n\
[h2]CONTENT &amp; BALANCE:[/h2]\n\n\
[b]Ancients:[/b]\n[list]\n\
[*]Nerfed [b]Tezcatara's Brightest Flame[/b] card: max HP loss increased from 1 → 2\n\
[*]Nerfed [b]Nonupeipe's Beautiful Bracelet[/b] relic: now Enchants 4 random cards\n[/list]\n\n\
[b]Enemies:[/b]\n[list]\n[*]Buffed [b]Axebot[/b]:\n[list]\n\
[*]Hammer Uppercut move damage increased from 12(14) → 14(18)\n[*]Now gains +10 Max HP each time it respawns\n[/list]\n[/list]\n\n\
[h2]BUG FIXES[/h2]\n[list]\n[*]Fixed a crash when loading a run\n[*]Card art no longer flickers\n[/list]\n\
[h2]Performance[/h2]\n[list]\n[*]Reduced memory usage on the map screen\n[/list]\n\
[h2]New stuff[/h2]\n[list]\n[*]Added Indonesian localization\n[*]Low HP idle animations for all characters\n[/list]";

    // Extrait réel (Apex Legends, mise à jour du 6/11/2026).
    const APEX: &str = "[p][img src=\"{STEAM_CLAN_IMAGE}/38098458/fc91.jpg\"][/img][/p][p] [b]MAP CHANGE[/b][/p]\
[list][*][p]Removed E-District (night) from all map rotations, and rotating in E-District (day)[/p][/*][/list]\
[p][i]Dev Note: We are working on a handful of high impact changes that improve visibility.[/i][/p]";

    fn textes(s: &Section) -> Vec<&str> {
        s.elements.iter().map(|e| e.texte.as_str()).collect()
    }

    #[test]
    fn tri_slay_the_spire() {
        let sections = trier(STS2);
        let cats: Vec<Categorie> = sections.iter().map(|s| s.categorie).collect();
        assert_eq!(
            cats,
            vec![Categorie::Nouveau, Categorie::Equilibrage, Categorie::Performances, Categorie::Correctifs]
        );
        let eq = &sections[1];
        assert_eq!(eq.elements.len(), 3, "{:?}", textes(eq));
        assert!(eq.elements[0].texte.starts_with("Nerfed Tezcatara's Brightest Flame card"));
        // Sous-liste rattachée à « Buffed Axebot: ».
        assert_eq!(eq.elements[2].texte, "Buffed Axebot:");
        assert_eq!(eq.elements[2].sous.len(), 2);
        // « Card art no longer flickers » n'a pas de mot-clé : il prend la catégorie du titre « BUG FIXES ».
        assert_eq!(textes(&sections[3]), vec!["Fixed a crash when loading a run", "Card art no longer flickers"]);
        assert_eq!(textes(&sections[2]), vec!["Reduced memory usage on the map screen"]);
        assert_eq!(textes(&sections[0]).len(), 2);
        // L'intro et l'image ont disparu, l'entité est décodée.
        let tout = format!("{sections:?}");
        assert!(!tout.contains("Time for another") && !tout.contains("STEAM_CLAN_IMAGE") && !tout.contains("&amp;"));
    }

    #[test]
    fn tri_apex() {
        let sections = trier(APEX);
        let tout: Vec<&str> = sections.iter().flat_map(textes).collect();
        assert!(tout.contains(&"Removed E-District (night) from all map rotations, and rotating in E-District (day)"));
        // Peu de points : les paragraphes sont gardés, sans image.
        assert!(tout.iter().any(|t| t.starts_with("Dev Note")));
        assert!(!format!("{sections:?}").contains("img"));
    }

    #[test]
    fn mots_cles() {
        assert_eq!(classer("Fixed a crash when loading"), Some(Categorie::Correctifs));
        assert_eq!(classer("Improved performance on older GPUs"), Some(Categorie::Performances));
        assert_eq!(classer("Nerfed the shotgun"), Some(Categorie::Equilibrage));
        assert_eq!(classer("Added a new map"), Some(Categorie::Nouveau));
        assert_eq!(classer("Ajout d'un nouveau mode"), Some(Categorie::Nouveau));
        assert_eq!(classer("Correction d'un plantage"), Some(Categorie::Correctifs));
        assert_eq!(classer("Updated the address field"), None, "« address » ne doit pas compter comme « add »");
        assert_eq!(classer("Prefix changes"), None, "« prefix » ne doit pas compter comme « fix »");
    }

    #[test]
    fn puces_et_sous_titres() {
        assert_eq!(sans_puce("· Fixed doors"), "Fixed doors");
        assert_eq!(sans_puce("- Added maps"), "Added maps");
        assert_eq!(sans_puce("-10% damage"), "-10% damage", "un nombre négatif n'est pas une puce");
        let s = trier("[p][b]MAP CHANGE[/b][/p][list][*]Removed E-District[/*][/list]");
        let tout: Vec<&str> = s.iter().flat_map(textes).collect();
        assert_eq!(tout, vec!["Removed E-District"]);
    }

    #[test]
    fn versions() {
        assert_eq!(version("Beta Patch Notes - v0.111.0").as_deref(), Some("0.111.0"));
        assert_eq!(version("Patch 1.2 is live").as_deref(), Some("1.2"));
        assert_eq!(version("Apex Legends: Latest Update - 11/6/2026"), None);
        assert_eq!(version("Hotfix"), None);
    }

    #[test]
    fn entites_et_html() {
        assert_eq!(decoder_entites("A &amp; B &#39;c&#39; &#x2192; &inconnu;"), "A & B 'c' → &inconnu;");
        let s = trier("<h2>Bug Fixes</h2><ul><li>Fixed sound</li><li>Doors open again</li></ul>");
        assert_eq!(s.len(), 1);
        assert_eq!(s[0].categorie, Categorie::Correctifs);
        assert_eq!(s[0].elements.len(), 2);
    }

    #[test]
    fn texte_vide_ou_abime() {
        assert!(trier("").is_empty());
        let _ = trier("[list][*][/list][/list][[[<<>>");
        let long = format!("[list][*]{}[/list]", "mot ".repeat(200));
        let s = trier(&long);
        assert!(s[0].elements[0].texte.ends_with('…'));
    }

    /// Vraies annonces de quelques jeux : affiche le tri obtenu.
    /// `cargo test notes_reelles -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn notes_reelles() {
        let c = crate::steam::webapi::ClientSteam::nouveau().unwrap();
        for app in [2868840u32, 1172470, 1145350, 1903340] {
            let actus = tauri::async_runtime::block_on(c.actus(app)).unwrap();
            let Some(n) = depuis_actus(&actus) else { println!("{app} : aucune annonce"); continue };
            println!("
{app} · {} · version {:?} · patch {}", n.titre, n.version, n.patch);
            for s in &n.sections {
                println!("  {:?} ({})", s.categorie, s.elements.len());
                for e in s.elements.iter().take(2) {
                    println!("    - {} [{} sous-points]", e.texte.chars().take(90).collect::<String>(), e.sous.len());
                }
            }
        }
    }
}
