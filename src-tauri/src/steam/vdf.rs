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

fn objet(jetons: &[Jeton], i: &mut usize) -> Vec<(String, Vdf)> {
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
                        paires.push((cle.clone(), Vdf::Objet(objet(jetons, i))));
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
    Vdf::Objet(objet(&jetons, &mut i))
}

#[cfg(test)]
mod tests {
    use super::*;

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
