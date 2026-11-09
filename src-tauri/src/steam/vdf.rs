//! Lecteur du format texte KeyValues (VDF) de Steam :
//! `libraryfolders.vdf`, `appmanifest_<id>.acf`.
//!
//! ```text
//! "AppState"
//! {
//!     "appid"   "1145350"
//!     "InstalledDepots" { "1145352" { "size" "11587114522" } }
//! }
//! ```

#[derive(Debug, Clone, PartialEq)]
pub enum Vdf {
    Texte(String),
    Objet(Vec<(String, Vdf)>),
}

impl Vdf {
    /// Valeur d'une clé (insensible à la casse : Steam mélange `appid` et `StateFlags`).
    pub fn get(&self, cle: &str) -> Option<&Vdf> {
        match self {
            Vdf::Objet(paires) => paires.iter().find(|(k, _)| k.eq_ignore_ascii_case(cle)).map(|(_, v)| v),
            Vdf::Texte(_) => None,
        }
    }

    pub fn texte(&self, cle: &str) -> Option<&str> {
        match self.get(cle)? {
            Vdf::Texte(t) => Some(t.as_str()),
            Vdf::Objet(_) => None,
        }
    }

    pub fn nombre<T: std::str::FromStr>(&self, cle: &str) -> Option<T> {
        self.texte(cle)?.trim().parse().ok()
    }

    pub fn paires(&self) -> &[(String, Vdf)] {
        match self {
            Vdf::Objet(p) => p,
            Vdf::Texte(_) => &[],
        }
    }
}

#[derive(Debug, PartialEq)]
enum Jeton {
    Chaine(String),
    Ouvre,
    Ferme,
}

fn decouper(source: &str) -> Vec<Jeton> {
    let mut jetons = Vec::new();
    let mut c = source.chars().peekable();
    while let Some(ch) = c.next() {
        match ch {
            '{' => jetons.push(Jeton::Ouvre),
            '}' => jetons.push(Jeton::Ferme),
            '"' => {
                let mut s = String::new();
                while let Some(x) = c.next() {
                    match x {
                        '"' => break,
                        '\\' => match c.next() {
                            Some('n') => s.push('\n'),
                            Some('t') => s.push('\t'),
                            Some(autre) => s.push(autre),
                            None => break,
                        },
                        _ => s.push(x),
                    }
                }
                jetons.push(Jeton::Chaine(s));
            }
            '/' if c.peek() == Some(&'/') => {
                // Commentaire jusqu'à la fin de la ligne.
                for x in c.by_ref() {
                    if x == '\n' {
                        break;
                    }
                }
            }
            '[' => {
                // Condition de plateforme ([$WIN32]) : ignorée.
                for x in c.by_ref() {
                    if x == ']' {
                        break;
                    }
                }
            }
            x if x.is_whitespace() => {}
            x => {
                // Valeur sans guillemets.
                let mut s = String::from(x);
                while let Some(&y) = c.peek() {
                    if y.is_whitespace() || y == '{' || y == '}' || y == '"' {
                        break;
                    }
                    s.push(y);
                    c.next();
                }
                jetons.push(Jeton::Chaine(s));
            }
        }
    }
    jetons
}

/// Profondeur maximale d'imbrication lue (les fichiers de Steam dépassent rarement 10).
/// Au-delà, le contenu est sauté sans récursion : un fichier piégé avec des milliers
/// d'accolades imbriquées ne peut pas faire déborder la pile (campagne « tout faire planter »).
pub const PROFONDEUR_MAX: usize = 64;

/// Saute un bloc déjà ouvert (jusqu'à son accolade fermante), sans récursion.
fn sauter_bloc(jetons: &[Jeton], i: &mut usize) {
    let mut niveau = 1usize;
    while *i < jetons.len() && niveau > 0 {
        match jetons[*i] {
            Jeton::Ouvre => niveau += 1,
            Jeton::Ferme => niveau -= 1,
            Jeton::Chaine(_) => {}
        }
        *i += 1;
    }
}

fn objet(jetons: &[Jeton], i: &mut usize, profondeur: usize) -> Vec<(String, Vdf)> {
    let mut paires = Vec::new();
    while *i < jetons.len() {
        match &jetons[*i] {
            Jeton::Ferme => {
                *i += 1;
                break;
            }
            Jeton::Ouvre => {
                // Accolade orpheline : on la saute.
                *i += 1;
            }
            Jeton::Chaine(cle) => {
                *i += 1;
                match jetons.get(*i) {
                    Some(Jeton::Chaine(v)) => {
                        paires.push((cle.clone(), Vdf::Texte(v.clone())));
                        *i += 1;
                    }
                    Some(Jeton::Ouvre) => {
                        *i += 1;
                        if profondeur + 1 >= PROFONDEUR_MAX {
                            sauter_bloc(jetons, i);
                            paires.push((cle.clone(), Vdf::Objet(Vec::new())));
                        } else {
                            paires.push((cle.clone(), Vdf::Objet(objet(jetons, i, profondeur + 1))));
                        }
                    }
                    _ => {}
                }
            }
        }
    }
    paires
}

/// Lit un document VDF. Le résultat est un objet racine (souvent une seule clé : `"AppState"`).
pub fn lire(source: &str) -> Vdf {
    let jetons = decouper(source.trim_start_matches('\u{feff}'));
    let mut i = 0;
    Vdf::Objet(objet(&jetons, &mut i, 0))
}

// ——— Modification en place (étape 10 : propriétés d'un jeu) ———
//
// On ne réécrit jamais tout le fichier : on remplace seulement la valeur visée, ou
// on l'ajoute dans son bloc. Le reste (ordre, mise en forme, clés inconnues) reste
// tel quel, octet pour octet.

enum JetonPos {
    Chaine { texte: String, debut: usize, fin: usize },
    Ouvre,
    Ferme { debut: usize },
}

fn decouper_positions(source: &str) -> Vec<JetonPos> {
    let octets = source.as_bytes();
    let mut jetons = Vec::new();
    let mut i = 0;
    while i < octets.len() {
        match octets[i] {
            b'{' => {
                jetons.push(JetonPos::Ouvre);
                i += 1;
            }
            b'}' => {
                jetons.push(JetonPos::Ferme { debut: i });
                i += 1;
            }
            b'"' => {
                let debut = i;
                i += 1;
                let mut brut = Vec::new();
                while i < octets.len() && octets[i] != b'"' {
                    if octets[i] == b'\\' && i + 1 < octets.len() {
                        i += 1; // caractère échappé : gardé tel quel
                    }
                    brut.push(octets[i]);
                    i += 1;
                }
                i += 1; // guillemet fermant
                let texte = String::from_utf8_lossy(&brut).into_owned();
                jetons.push(JetonPos::Chaine { texte, debut, fin: i.min(octets.len()) });
            }
            b'/' if octets.get(i + 1) == Some(&b'/') => {
                while i < octets.len() && octets[i] != b'\n' {
                    i += 1;
                }
            }
            _ => i += 1,
        }
    }
    jetons
}

/// Chaîne VDF entre guillemets (`\` et `"` échappés).
pub fn citer(valeur: &str) -> String {
    format!("\"{}\"", valeur.replace('\\', "\\\\").replace('"', "\\\""))
}

fn meme_chemin(pile: &[String], chemin: &[&str]) -> bool {
    pile.len() == chemin.len() && pile.iter().zip(chemin).all(|(a, b)| a.eq_ignore_ascii_case(b))
}

fn prefixe_de(pile: &[String], chemin: &[&str]) -> bool {
    pile.len() <= chemin.len() && pile.iter().zip(chemin).all(|(a, b)| a.eq_ignore_ascii_case(b))
}

/// Donne la valeur `valeur` à `cle` dans le bloc `chemin` (créé s'il manque, sous le
/// bloc existant le plus profond). `None` si même la racine du chemin est absente.
pub fn modifier(source: &str, chemin: &[&str], cle: &str, valeur: &str) -> Option<String> {
    let jetons = decouper_positions(source);
    let mut pile: Vec<String> = Vec::new();
    let mut cle_en_attente: Option<String> = None;
    // Fermeture du bloc existant le plus profond sur le chemin : (profondeur, position).
    let mut meilleur: Option<(usize, usize)> = None;
    for j in &jetons {
        match j {
            JetonPos::Chaine { texte, debut, fin } => match cle_en_attente.take() {
                Some(k) => {
                    if meme_chemin(&pile, chemin) && k.eq_ignore_ascii_case(cle) {
                        return Some(format!("{}{}{}", &source[..*debut], citer(valeur), &source[*fin..]));
                    }
                }
                None => cle_en_attente = Some(texte.clone()),
            },
            JetonPos::Ouvre => pile.push(cle_en_attente.take().unwrap_or_default()),
            JetonPos::Ferme { debut } => {
                cle_en_attente = None;
                if !pile.is_empty() && prefixe_de(&pile, chemin) && meilleur.is_none_or(|(p, _)| pile.len() > p) {
                    meilleur = Some((pile.len(), *debut));
                }
                pile.pop();
            }
        }
    }
    let (profondeur, position) = meilleur?;
    let fin_de_ligne = if source.contains("\r\n") { "\r\n" } else { "\n" };
    // Indentation : celle de l'accolade fermante, plus une tabulation.
    let debut_ligne = source[..position].rfind('\n').map(|n| n + 1).unwrap_or(0);
    let marge_brute = &source[debut_ligne..position];
    let seule_sur_sa_ligne = marge_brute.chars().all(|c| c == '\t' || c == ' ');
    let marge = if seule_sur_sa_ligne { marge_brute.to_string() } else { String::new() };
    let mut ajout = String::new();
    let mut ind = format!("{marge}\t");
    for segment in &chemin[profondeur..] {
        ajout.push_str(&format!("{ind}{}{fin_de_ligne}{ind}{{{fin_de_ligne}", citer(segment)));
        ind.push('\t');
    }
    ajout.push_str(&format!("{ind}{}\t\t{}{fin_de_ligne}", citer(cle), citer(valeur)));
    for _ in profondeur..chemin.len() {
        ind.pop();
        ajout.push_str(&format!("{ind}}}{fin_de_ligne}"));
    }
    // Insertion au début de la ligne de l'accolade quand elle est seule sur sa ligne.
    let point = if seule_sur_sa_ligne { debut_ligne } else { position };
    Some(format!("{}{}{}", &source[..point], ajout, &source[point..]))
}

#[cfg(test)]
mod tests {
    use super::*;

    const CONFIG: &str = "\"UserLocalConfigStore\"\n{\n\t\"Software\"\n\t{\n\t\t\"Valve\"\n\t\t{\n\t\t\t\"Steam\"\n\t\t\t{\n\t\t\t\t\"apps\"\n\t\t\t\t{\n\t\t\t\t\t\"730\"\n\t\t\t\t\t{\n\t\t\t\t\t\t\"LastPlayed\"\t\t\"1\"\n\t\t\t\t\t\t\"LaunchOptions\"\t\t\"-novid\"\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n}\n";

    fn apps(s: &str) -> Vdf {
        lire(s).get("UserLocalConfigStore").unwrap().get("Software").unwrap().get("Valve").unwrap().get("Steam").unwrap().get("apps").unwrap().clone()
    }

    #[test]
    fn remplace_une_valeur_existante() {
        let chemin = ["UserLocalConfigStore", "Software", "Valve", "Steam", "apps", "730"];
        let s = modifier(CONFIG, &chemin, "LaunchOptions", "-high \"x\"").unwrap();
        assert!(s.contains("\"LaunchOptions\"\t\t\"-high \\\"x\\\"\""), "{s}");
        let a = apps(&s);
        assert_eq!(a.get("730").unwrap().texte("LaunchOptions"), Some("-high \"x\""));
        assert_eq!(a.get("730").unwrap().texte("LastPlayed"), Some("1"));
    }

    #[test]
    fn ajoute_une_cle_et_un_bloc() {
        let s = modifier(CONFIG, &["UserLocalConfigStore", "Software", "Valve", "Steam", "apps", "730"], "OverlayAppEnable", "0").unwrap();
        let a = apps(&s);
        assert_eq!(a.get("730").unwrap().texte("OverlayAppEnable"), Some("0"));
        assert_eq!(a.get("730").unwrap().texte("LaunchOptions"), Some("-novid"));
        // Jeu jamais réglé : le bloc est créé dans « apps ».
        let s2 = modifier(&s, &["UserLocalConfigStore", "Software", "Valve", "Steam", "apps", "1145350"], "LaunchOptions", "-windowed").unwrap();
        let a2 = apps(&s2);
        assert_eq!(a2.get("1145350").unwrap().texte("LaunchOptions"), Some("-windowed"));
        assert_eq!(a2.get("730").unwrap().texte("LaunchOptions"), Some("-novid"));
        assert!(s2.contains("\t\t\t\t\t\"1145350\"\n\t\t\t\t\t{\n\t\t\t\t\t\t\"LaunchOptions\"\t\t\"-windowed\"\n\t\t\t\t\t}\n\t\t\t\t}"), "{s2}");
    }

    #[test]
    fn racine_absente() {
        assert!(modifier(CONFIG, &["Autre", "x"], "a", "b").is_none());
    }

    #[test]
    fn manifeste_modifie() {
        let m = "\"AppState\"\r\n{\r\n\t\"appid\"\t\t\"1\"\r\n\t\"AutoUpdateBehavior\"\t\t\"0\"\r\n}\r\n";
        let s = modifier(m, &["AppState"], "AutoUpdateBehavior", "1").unwrap();
        assert_eq!(s, m.replace("\"AutoUpdateBehavior\"\t\t\"0\"", "\"AutoUpdateBehavior\"\t\t\"1\""));
        let s = modifier(m, &["AppState"], "AllowOtherDownloadsWhileRunning", "2").unwrap();
        assert!(s.ends_with("\t\"AllowOtherDownloadsWhileRunning\"\t\t\"2\"\r\n}\r\n"), "{s:?}");
    }

    const MANIFESTE: &str = r#"
"AppState"
{
	"appid"		"1145350"
	"name"		"Hades II"
	"StateFlags"		"4"
	"installdir"		"Hades II"
	"SizeOnDisk"		"11774185682"
	// commentaire
	"InstalledDepots"
	{
		"1145352"
		{
			"manifest"		"6846318752230433935"
			"size"		"11587114522"
		}
	}
	"chemin"	"C:\\Program Files (x86)\\Steam"
	"guillemet"	"un \"mot\""
}
"#;

    #[test]
    fn manifeste() {
        let racine = lire(MANIFESTE);
        let app = racine.get("AppState").unwrap();
        assert_eq!(app.nombre::<u32>("appid"), Some(1145350));
        assert_eq!(app.texte("NAME"), Some("Hades II"));
        assert_eq!(app.nombre::<u64>("SizeOnDisk"), Some(11774185682));
        assert_eq!(app.nombre::<u32>("stateflags"), Some(4));
        let depot = app.get("InstalledDepots").unwrap().get("1145352").unwrap();
        assert_eq!(depot.texte("size"), Some("11587114522"));
        assert_eq!(app.texte("chemin"), Some(r"C:\Program Files (x86)\Steam"));
        assert_eq!(app.texte("guillemet"), Some(r#"un "mot""#));
    }

    #[test]
    fn dossiers_bibliotheque() {
        let src = r#""libraryfolders" { "0" { "path" "C:\\Steam" "apps" { "10" "100" "20" "200" } } "1" { "path" "E:\\SteamLibrary" "apps" { } } }"#;
        let racine = lire(src);
        let dossiers = racine.get("libraryfolders").unwrap().paires();
        assert_eq!(dossiers.len(), 2);
        assert_eq!(dossiers[1].1.texte("path"), Some(r"E:\SteamLibrary"));
        assert_eq!(dossiers[0].1.get("apps").unwrap().paires().len(), 2);
    }

    #[test]
    fn document_abime_sans_panique() {
        let racine = lire("\"a\" { \"b\" \"c\" ");
        assert_eq!(racine.get("a").unwrap().texte("b"), Some("c"));
        let _ = lire("}}}{{{\"");
        let _ = lire("");
    }
}
