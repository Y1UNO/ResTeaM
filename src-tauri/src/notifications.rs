//! Notifications Windows (étape « Notifications ») :
//! - téléchargement terminé, mise à jour prête (lecture des `appmanifest`, toutes les 8 s) ;
//! - un ami lance un jeu (`GetPlayerSummaries` des amis, toutes les 90 s) ;
//! - une promo dans la liste de souhaits (toutes les 6 h ; chaque promo n'est annoncée qu'une fois).
//!
//! Chaque type se coupe dans les Paramètres.
//!
//! Affichage (idée de Tom : « les notifications de Windows sont fades ») : une petite
//! fenêtre ResTeaM (`notifs`) sans cadre, transparente, toujours au-dessus, qui ne
//! prend **jamais** le focus (un jeu au premier plan le reste) et n'apparaît pas dans
//! la barre des tâches. Elle montre des cartes animées : avatar animé et cadre de
//! l'ami, visuel du jeu, réduction… Un clic ouvre la bonne page de ResTeaM.
//! « Ne pas déranger en jeu » : les notifications attendent la fin de la partie.
//! En secours (fenêtre impossible), la notification de Windows, pour laquelle ResTeaM
//! s'inscrit lui-même (`AppUserModelId` de l'utilisateur : nom et icône).

use std::collections::{HashMap, HashSet, VecDeque};
use std::path::Path;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

use crate::commandes::EtatApp;
use crate::preferences;
use crate::steam::local::{self, EtatInstallation};

pub const AUMID: &str = "com.yiuno.resteam";
const CLE_PROMOS: &str = "promos-annoncees";

/// Inscrit ResTeaM auprès de Windows (nom et icône des notifications), puis lance la surveillance.
pub fn installer(app: &AppHandle, dossier: &Path) {
    let icone = dossier.join("notification.png");
    let _ = std::fs::write(&icone, include_bytes!("../icons/128x128.png"));
    #[cfg(windows)]
    {
        use winreg::RegKey;
        use winreg::enums::HKEY_CURRENT_USER;
        if let Ok((cle, _)) = RegKey::predef(HKEY_CURRENT_USER).create_subkey(format!(r"Software\Classes\AppUserModelId\{AUMID}")) {
            let _ = cle.set_value("DisplayName", &"ResTeaM");
            let _ = cle.set_value("IconUri", &icone.to_string_lossy().into_owned());
            let _ = cle.set_value("IconBackgroundColor", &"FF09090A");
        }
    }
    let a = app.clone();
    tauri::async_runtime::spawn(async move { surveiller_installations(a).await });
    let a = app.clone();
    tauri::async_runtime::spawn(async move { surveiller_amis(a).await });
    let a = app.clone();
    tauri::async_runtime::spawn(async move { surveiller_promos(a).await });
}

// ——— Cartes de notification ResTeaM ———

pub const FENETRE: &str = "notifs";
/// Largeur de la fenêtre des notifications, en pixels logiques.
const LARGEUR: f64 = 392.0;
const MARGE: f64 = 14.0;

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Notif {
    pub id: u64,
    /// `ami`, `telechargement`, `maj`, `promo` ou `resteam`.
    pub genre: String,
    pub titre: String,
    pub texte: String,
    /// Grand visuel en fond (bannière du jeu).
    pub image: Option<String>,
    /// Vignette : jaquette du jeu, ou avatar (animé si possible) de l'ami.
    pub vignette: Option<String>,
    /// Cadre d'avatar de l'ami (objet Steam, souvent animé).
    pub cadre: Option<String>,
    /// Gros badge (réduction d'une promo).
    pub badge: Option<String>,
    /// Bouton « Jouer » (appid).
    pub jouer: Option<u32>,
    /// Page de ResTeaM ouverte au clic.
    pub page: Option<String>,
}

static FILE: Mutex<VecDeque<Notif>> = Mutex::new(VecDeque::new());
/// Retenues pendant une partie (« ne pas déranger en jeu »).
static RETENUES: Mutex<Vec<Notif>> = Mutex::new(Vec::new());
static PROCHAIN: AtomicU64 = AtomicU64::new(1);

/// Envoie une notification : tout de suite, ou à la fin de la partie en cours.
pub fn envoyer(app: &AppHandle, mut n: Notif) {
    n.id = PROCHAIN.fetch_add(1, Ordering::Relaxed);
    if preferences::lire(app).notif_pas_en_jeu && crate::jeu::etat().en_cours.is_some() {
        if let Ok(mut r) = RETENUES.lock() {
            if r.len() < 20 {
                r.push(n);
            }
        }
        return;
    }
    afficher(app, vec![n]);
}

/// Affiche tout de suite, même pendant une partie (notification d'essai).
pub fn envoyer_maintenant(app: &AppHandle, mut n: Notif) {
    n.id = PROCHAIN.fetch_add(1, Ordering::Relaxed);
    afficher(app, vec![n]);
}

/// Fin de la partie : les notifications retenues s'affichent.
pub fn liberer(app: &AppHandle) {
    let retenues: Vec<Notif> = RETENUES.lock().map(|mut r| std::mem::take(&mut *r)).unwrap_or_default();
    if !retenues.is_empty() {
        afficher(app, retenues);
    }
}

fn afficher(app: &AppHandle, notifs: Vec<Notif>) {
    if let Ok(mut f) = FILE.lock() {
        f.extend(notifs);
        while f.len() > 12 {
            f.pop_front();
        }
    }
    let app = app.clone();
    // Fenêtre créée hors du fil principal (sous Windows, sinon WebView2 se bloque).
    tauri::async_runtime::spawn(async move {
        if app.get_webview_window(FENETRE).is_none() {
            let cree = WebviewWindowBuilder::new(&app, FENETRE, WebviewUrl::App("index.html".into()))
                .title("Notifications ResTeaM")
                .inner_size(LARGEUR, 120.0)
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .shadow(false)
                .resizable(false)
                .focusable(false)
                .focused(false)
                .visible(false)
                .build();
            if let Err(e) = cree {
                eprintln!("fenêtre des notifications : {e}");
                // Secours : notifications de Windows.
                for n in prendre() {
                    toast_windows(&app, n.titre, n.texte);
                }
                return;
            }
        }
        let _ = app.emit_to(FENETRE, "notifs-nouvelles", ());
    });
}

/// Notifications à afficher (la fenêtre les prend en s'ouvrant, puis à chaque événement).
pub fn prendre() -> Vec<Notif> {
    FILE.lock().map(|mut f| f.drain(..).collect()).unwrap_or_default()
}

/// Place la fenêtre dans le coin choisi, à la hauteur des cartes (0 : cachée).
pub fn ajuster(app: &AppHandle, hauteur: f64) -> tauri::Result<()> {
    let Some(f) = app.get_webview_window(FENETRE) else { return Ok(()) };
    if hauteur <= 0.0 {
        return f.hide();
    }
    let Some(ecran) = f.primary_monitor()?.or(app.primary_monitor()?) else { return Ok(()) };
    let echelle = ecran.scale_factor();
    let zone = ecran.work_area();
    let (l, h, m) = ((LARGEUR * echelle) as i32, (hauteur.min(900.0) * echelle) as i32, (MARGE * echelle) as i32);
    let coin = preferences::lire(app).notif_coin;
    let droite = !coin.ends_with('g');
    let bas = coin.starts_with('b');
    let x = if droite { zone.position.x + zone.size.width as i32 - l - m } else { zone.position.x + m };
    let y = if bas { zone.position.y + zone.size.height as i32 - h - m } else { zone.position.y + m };
    f.set_size(PhysicalSize::new(l as u32, h as u32))?;
    f.set_position(PhysicalPosition::new(x, y))?;
    f.show()
}

/// Pages que la fenêtre des notifications peut ouvrir (jamais une adresse libre).
pub fn page_valide(p: &str) -> bool {
    let chiffres = |s: &str, min: usize, max: usize| (min..=max).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_digit());
    match p {
        "/telechargements" | "/souhaits" | "/bibliotheque" | "/amis" | "/parametres" => true,
        _ => p.strip_prefix("/jeu/").is_some_and(|id| chiffres(id, 1, 10)) || p.strip_prefix("/profil/").is_some_and(|id| chiffres(id, 17, 17)),
    }
}

/// Visuels d'un jeu (bannière et jaquette), d'après le magasin.
async fn visuels(app: &AppHandle, app_id: u32) -> (Option<String>, Option<String>) {
    let etat = app.state::<EtatApp>();
    let im = etat.steam.images(&[app_id]).await.ok().and_then(|m| m.get(&app_id).cloned()).unwrap_or_else(|| crate::steam::images::adresses_classiques(app_id));
    (im.banniere, im.jaquette)
}

/// Notification Windows (secours). Un clic remet ResTeaM à l'écran.
pub fn toast_windows(app: &AppHandle, titre: String, texte: String) {
    #[cfg(windows)]
    {
        let app = app.clone();
        std::thread::spawn(move || {
            let a = app.clone();
            let r = tauri_winrt_notification::Toast::new(AUMID)
                .title(&titre)
                .text1(&texte)
                .on_activated(move |_| {
                    if let Some(f) = a.get_webview_window("main") {
                        let _ = f.show();
                        let _ = f.unminimize();
                        let _ = f.set_focus();
                    }
                    Ok(())
                })
                .show();
            if let Err(e) = r {
                eprintln!("notification : {e}");
            }
            // Garde le fil en vie le temps d'un éventuel clic.
            std::thread::sleep(Duration::from_secs(30));
        });
    }
    #[cfg(not(windows))]
    let _ = (app, titre, texte);
}

// ——— Téléchargements et mises à jour ———

#[derive(Debug, PartialEq)]
pub enum Annonce {
    Termine(u32),
    MiseAJour(u32),
}

/// Compare deux relevés des jeux installés. `deja_installes` : jeux déjà vus prêts
/// à jouer (leur prochain téléchargement est une mise à jour).
pub fn annonces(avant: &HashMap<u32, EtatInstallation>, apres: &HashMap<u32, EtatInstallation>, deja_installes: &HashSet<u32>) -> Vec<Annonce> {
    let mut a: Vec<Annonce> = apres
        .iter()
        .filter(|(id, e)| {
            **e == EtatInstallation::Installe
                && avant.get(id).is_some_and(|p| matches!(p, EtatInstallation::Telechargement | EtatInstallation::EnPause | EtatInstallation::MiseAJourRequise))
        })
        .map(|(id, _)| if deja_installes.contains(id) { Annonce::MiseAJour(*id) } else { Annonce::Termine(*id) })
        .collect();
    a.sort_by_key(|x| match x {
        Annonce::Termine(i) | Annonce::MiseAJour(i) => *i,
    });
    a
}

async fn surveiller_installations(app: AppHandle) {
    let Some(steam) = local::dossier_steam() else { return };
    let mut avant: Option<HashMap<u32, EtatInstallation>> = None;
    let mut deja_installes = HashSet::new();
    loop {
        let s = steam.clone();
        let jeux = tokio::task::spawn_blocking(move || local::jeux_installes(&s)).await.unwrap_or_default();
        let noms: HashMap<u32, String> = jeux.iter().map(|j| (j.app_id, j.nom.clone())).collect();
        let apres: HashMap<u32, EtatInstallation> = jeux.iter().map(|j| (j.app_id, j.etat)).collect();
        if let Some(avant) = &avant {
            let p = preferences::lire(&app);
            for a in annonces(avant, &apres, &deja_installes) {
                let (id, genre, texte) = match a {
                    Annonce::Termine(id) if p.notif_telechargement => (id, "telechargement", "Téléchargement terminé : prêt à jouer."),
                    Annonce::MiseAJour(id) if p.notif_maj => (id, "maj", "Mise à jour installée : le jeu est à jour."),
                    _ => continue,
                };
                let (image, vignette) = visuels(&app, id).await;
                envoyer(
                    &app,
                    Notif {
                        genre: genre.into(),
                        titre: noms.get(&id).cloned().unwrap_or_default(),
                        texte: texte.into(),
                        image,
                        vignette,
                        jouer: Some(id),
                        page: Some(format!("/jeu/{id}")),
                        ..Default::default()
                    },
                );
            }
        }
        deja_installes.extend(apres.iter().filter(|(_, e)| **e == EtatInstallation::Installe).map(|(id, _)| *id));
        avant = Some(apres);
        tokio::time::sleep(Duration::from_secs(8)).await;
    }
}

// ——— Amis en jeu ———

/// Amis qui viennent de lancer un jeu : (SteamID, jeu). Un changement de jeu compte aussi.
pub fn amis_lances(avant: &HashMap<String, Option<String>>, apres: &HashMap<String, Option<String>>) -> Vec<(String, String)> {
    let mut l: Vec<(String, String)> = apres
        .iter()
        .filter_map(|(id, jeu)| {
            let jeu = jeu.as_ref()?;
            let precedent = avant.get(id)?;
            (precedent.as_ref() != Some(jeu)).then(|| (id.clone(), jeu.clone()))
        })
        .collect();
    l.sort();
    l
}

async fn surveiller_amis(app: AppHandle) {
    let mut avant: Option<HashMap<String, Option<String>>> = None;
    loop {
        tokio::time::sleep(Duration::from_secs(90)).await;
        if !preferences::lire(&app).notif_ami {
            avant = None;
            continue;
        }
        let (Ok(Some(session)), Ok(Some(cle))) = (crate::session::lire(&app), crate::secrets::lire()) else { continue };
        let etat = app.state::<EtatApp>();
        let Ok(liste) = etat.steam.amis(&cle, &session.steam_id).await else { continue };
        let joueurs: HashMap<String, crate::steam::webapi::Joueur> = liste.amis.iter().map(|a| (a.joueur.steam_id.clone(), a.joueur.clone())).collect();
        let apres: HashMap<String, Option<String>> = liste.amis.into_iter().map(|a| (a.joueur.steam_id, a.joueur.jeu_en_cours)).collect();
        if let Some(avant) = &avant {
            let lances = amis_lances(avant, &apres);
            // Pas d'avalanche : au-delà de 3, un seul résumé.
            if lances.len() > 3 {
                envoyer(
                    &app,
                    Notif { genre: "ami".into(), titre: "Tes amis jouent".into(), texte: format!("{} amis viennent de lancer un jeu.", lances.len()), page: Some("/amis".into()), ..Default::default() },
                );
            } else {
                for (id, jeu) in lances {
                    let Some(j) = joueurs.get(&id) else { continue };
                    // Avatar animé et cadre de l'ami (objets Steam), visuel du jeu.
                    let objets = etat.steam.objets_profil(&id).await.ok();
                    let vignette = objets.as_ref().and_then(|o| o.avatar_anime.as_ref()).and_then(|a| a.image.clone()).or(Some(j.avatar.clone()));
                    let cadre = objets.as_ref().and_then(|o| o.cadre.as_ref()).and_then(|c| c.image.clone());
                    let app_jeu = j.jeu_en_cours_id.as_deref().and_then(|x| x.parse::<u32>().ok());
                    let image = match app_jeu {
                        Some(a) => visuels(&app, a).await.0,
                        None => None,
                    };
                    envoyer(
                        &app,
                        Notif { genre: "ami".into(), titre: j.pseudo.clone(), texte: format!("joue à {jeu}"), image, vignette, cadre, page: Some(format!("/profil/{id}")), ..Default::default() },
                    );
                }
            }
        }
        avant = Some(apres);
    }
}

// ——— Promos de la liste de souhaits ———

/// Clé d'une promo (jeu, réduction, fin) : annoncée une seule fois.
pub fn cle_promo(app_id: u32, reduction: u32, fin: Option<i64>) -> String {
    format!("{app_id}:{reduction}:{}", fin.unwrap_or(0))
}

async fn surveiller_promos(app: AppHandle) {
    tokio::time::sleep(Duration::from_secs(120)).await;
    loop {
        if preferences::lire(&app).notif_promo {
            if let Err(e) = verifier_promos(&app).await {
                eprintln!("promos : {e}");
            }
        }
        tokio::time::sleep(Duration::from_secs(6 * 3600)).await;
    }
}

async fn verifier_promos(app: &AppHandle) -> crate::erreur::Resultat<()> {
    let Some(session) = crate::session::lire(app)? else { return Ok(()) };
    let etat = app.state::<EtatApp>();
    let souhaits = etat.steam.souhaits(&session.steam_id).await?;
    let ids: Vec<u32> = souhaits.iter().map(|s| s.app_id).take(300).collect();
    if ids.is_empty() {
        return Ok(());
    }
    let produits = etat.steam.produits(&ids, &HashMap::new()).await?;
    let mut annoncees: HashSet<String> = etat.cache.frais::<HashSet<String>>(CLE_PROMOS)?.unwrap_or_default();
    let nouvelles: Vec<_> = produits
        .iter()
        .filter_map(|p| {
            let prix = p.prix.as_ref().filter(|x| x.reduction > 0)?;
            let cle = cle_promo(p.app_id, prix.reduction, prix.fin_promo);
            (!annoncees.contains(&cle)).then(|| (cle, p.nom.clone(), prix.reduction, prix.texte_final.clone(), p.app_id, prix.texte_initial.clone()))
        })
        .collect();
    if nouvelles.len() > 3 {
        envoyer(
            app,
            Notif { genre: "promo".into(), titre: "Promos dans ta liste de souhaits".into(), texte: format!("{} jeux de ta liste sont en promotion.", nouvelles.len()), page: Some("/souhaits".into()), ..Default::default() },
        );
    } else {
        for (_, nom, reduction, prix, app_id, initial) in &nouvelles {
            let (image, vignette) = visuels(app, *app_id).await;
            envoyer(
                app,
                Notif {
                    genre: "promo".into(),
                    titre: nom.clone(),
                    texte: format!("{prix} au lieu de {initial}"),
                    image,
                    vignette,
                    badge: Some(format!("-{reduction} %")),
                    page: Some(format!("/jeu/{app_id}")),
                    ..Default::default()
                },
            );
        }
    }
    annoncees.extend(nouvelles.into_iter().map(|n| n.0));
    etat.cache.ranger(CLE_PROMOS, &annoncees, 60 * 86_400)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use EtatInstallation::*;

    #[test]
    fn telechargements_et_mises_a_jour() {
        let avant = HashMap::from([(1, Telechargement), (2, Telechargement), (3, Installe), (4, EnPause)]);
        let apres = HashMap::from([(1, Installe), (2, Installe), (3, Installe), (4, EnPause)]);
        // 2 était déjà installé avant son téléchargement : c'est une mise à jour.
        assert_eq!(annonces(&avant, &apres, &HashSet::from([2, 3])), vec![Annonce::Termine(1), Annonce::MiseAJour(2)]);
        // Rien de neuf au premier relevé d'un jeu inconnu.
        assert!(annonces(&HashMap::new(), &apres, &HashSet::new()).is_empty());
    }

    #[test]
    fn amis() {
        let s = |v: &[(&str, Option<&str>)]| v.iter().map(|(a, b)| (a.to_string(), b.map(str::to_string))).collect::<HashMap<_, _>>();
        let avant = s(&[("a", None), ("b", Some("Hades")), ("c", Some("CS2"))]);
        let apres = s(&[("a", Some("Rust")), ("b", Some("Hades")), ("c", Some("Dota")), ("d", Some("Nouveau"))]);
        // « d » est un nouvel ami : pas annoncé (rien à comparer).
        assert_eq!(amis_lances(&avant, &apres), vec![("a".into(), "Rust".into()), ("c".into(), "Dota".into())]);
    }

    #[test]
    fn pages_ouvertes_au_clic() {
        for ok in ["/telechargements", "/souhaits", "/jeu/730", "/profil/76561198000000000", "/amis"] {
            assert!(page_valide(ok), "{ok}");
        }
        for non in ["/jeu/", "/jeu/73a", "/jeu/730/../x", "/profil/123", "https://evil.io", "/jeu/12345678901", "//evil.io", "/parametres/x"] {
            assert!(!page_valide(non), "{non}");
        }
    }

    #[test]
    fn cles_de_promo() {
        assert_eq!(cle_promo(730, 50, Some(9)), "730:50:9");
        assert_ne!(cle_promo(730, 50, None), cle_promo(730, 60, None));
    }
}
