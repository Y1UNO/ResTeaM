//! Salon d'achat : une fenêtre ResTeaM qui affiche les **vraies pages de Steam**
//! (fiche, panier, connexion, paiement). Steam gère et sécurise tout l'achat ;
//! ResTeaM n'en voit rien.
//!
//! - En haut, la barre du salon (`salon-barre`) : une page locale de ResTeaM
//!   (navigation, adresse réelle avec cadenas, panier, boutons de fenêtre).
//! - En dessous, Steam (`salon-steam`) : une page distante, **sans aucun accès
//!   aux commandes de ResTeaM** (aucune capacité ne vise les adresses distantes),
//!   avec **son propre dossier de données WebView2** (cookies de Steam isolés de
//!   la fenêtre principale, chiffrés par Windows). Aucun script ni CSS n'est
//!   ajouté aux pages de Steam : connexion et paiement restent authentiques.
//! - Navigation : HTTPS seulement. Les pages hors de Steam (PayPal…) restent
//!   possibles pour payer, mais la barre les signale en orange.

use std::sync::Mutex;

use serde::Serialize;
use tauri::webview::{NewWindowResponse, PageLoadEvent, WebviewBuilder};
use tauri::window::WindowBuilder;
use tauri::window::{Color, Window};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Url, WebviewUrl, WindowEvent};
use tauri_plugin_opener::OpenerExt;

pub const FENETRE: &str = "salon";
pub const BARRE: &str = "salon-barre";
pub const STEAM: &str = "salon-steam";
/// Hauteur de la barre ResTeaM, en pixels logiques.
const HAUTEUR_BARRE: f64 = 60.0;
/// Fond de la DA (le même que la fenêtre principale), affiché avant les pages.
const FOND: Color = Color(9, 9, 10, 255);

pub const ACCUEIL: &str = "https://store.steampowered.com/";
pub const PANIER: &str = "https://store.steampowered.com/cart/";

/// Domaines officiels de Steam (affichés en vert, cadenas).
pub fn domaine_steam(hote: &str) -> bool {
    matches!(hote, "steampowered.com" | "steamcommunity.com")
        || hote.ends_with(".steampowered.com")
        || hote.ends_with(".steamcommunity.com")
}

/// Adresse demandée par ResTeaM : HTTPS, domaine de Steam, sans identifiants.
pub fn adresse_depart(adresse: &str) -> Option<Url> {
    let u = Url::parse(adresse).ok()?;
    (u.scheme() == "https" && u.host_str().is_some_and(domaine_steam) && u.username().is_empty() && u.password().is_none())
        .then_some(u)
}

/// Navigation permise dans le salon : HTTPS uniquement (plus `about:blank`).
pub fn navigation_autorisee(u: &Url) -> bool {
    u.scheme() == "https" || u.as_str() == "about:blank"
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EtatSalon {
    pub url: String,
    pub hote: String,
    /// Domaine officiel de Steam.
    pub officiel: bool,
    pub securise: bool,
    pub titre: String,
    pub chargement: bool,
}

/// Dernier état connu (la barre le relit en s'ouvrant).
static ETAT: Mutex<Option<EtatSalon>> = Mutex::new(None);

pub fn etat() -> Option<EtatSalon> {
    ETAT.lock().ok().and_then(|e| e.clone())
}

fn publier(app: &AppHandle, maj: impl FnOnce(&mut EtatSalon)) {
    let Ok(mut garde) = ETAT.lock() else { return };
    let etat = garde.get_or_insert_with(EtatSalon::default);
    maj(etat);
    let copie = etat.clone();
    drop(garde);
    let _ = app.emit_to(BARRE, "salon-etat", copie);
}

fn adresse(app: &AppHandle, u: &Url, chargement: bool) {
    let hote = u.host_str().unwrap_or_default().to_string();
    publier(app, |e| {
        e.url = u.to_string();
        e.officiel = domaine_steam(&hote);
        e.securise = u.scheme() == "https";
        e.hote = hote;
        e.chargement = chargement;
    });
}

/// Ouvre le salon sur une page de Steam (ou y navigue s'il est déjà ouvert).
///
/// **À appeler hors du fil principal** (commande `async`) : sous Windows, créer
/// une webview depuis le fil principal bloque WebView2 (`Window::add_child`
/// attend le fil principal), et la fenêtre reste grise et vide.
pub fn ouvrir(app: &AppHandle, url: Url) -> tauri::Result<()> {
    if let Some(steam) = app.get_webview(STEAM) {
        steam.navigate(url)?;
        if let Some(f) = app.get_window(FENETRE) {
            let _ = f.unminimize();
            let _ = f.show();
            let _ = f.set_focus();
        }
        return Ok(());
    }
    adresse(app, &url, true);

    // Cachée jusqu'à ce que la barre et Steam soient en place : jamais de fenêtre vide.
    let fenetre = WindowBuilder::new(app, FENETRE)
        .title("Salon d'achat · ResTeaM")
        .inner_size(1320.0, 880.0)
        .min_inner_size(960.0, 640.0)
        .decorations(false)
        .shadow(true)
        .theme(Some(tauri::Theme::Dark))
        .background_color(FOND)
        .visible(false)
        .center()
        .build()?;
    if let Err(e) = remplir(app, &fenetre, url) {
        // Échec : pas de fenêtre fantôme, et la barre repartira de zéro.
        let _ = fenetre.destroy();
        if let Ok(mut etat) = ETAT.lock() {
            *etat = None;
        }
        return Err(e);
    }
    fenetre.show()?;
    let _ = fenetre.set_focus();
    Ok(())
}

/// Pose la barre et la page de Steam dans la fenêtre du salon.
fn remplir(app: &AppHandle, fenetre: &Window, url: Url) -> tauri::Result<()> {
    let taille = fenetre.inner_size()?.to_logical::<f64>(fenetre.scale_factor()?);

    // La barre : une page locale de ResTeaM (main.tsx la reconnaît à son nom).
    fenetre.add_child(
        WebviewBuilder::new(BARRE, WebviewUrl::App("index.html".into())).background_color(FOND),
        LogicalPosition::new(0.0, 0.0),
        LogicalSize::new(taille.width, HAUTEUR_BARRE),
    )?;

    let (a1, a2, a3, a4, a5) = (app.clone(), app.clone(), app.clone(), app.clone(), app.clone());
    let steam = WebviewBuilder::new(STEAM, WebviewUrl::External(url))
        // Fond sombre avant le premier affichage de Steam (aucun script ajouté à la page).
        .background_color(FOND)
        // Cookies et cache de Steam à part, loin de la fenêtre principale.
        .data_directory(app.path().app_data_dir()?.join("salon-steam"))
        // Garde SmartScreen (wry le coupe par défaut) : protection anti-hameçonnage.
        .additional_browser_args("--disable-features=msWebOOUI,msPdfOOUI")
        .on_navigation(move |u| {
            // Liens `steam://` des pages (Jouer, Installer…) : confiés au client Steam.
            if u.scheme() == "steam" {
                let _ = a5.opener().open_url(u.as_str(), None::<&str>);
                return false;
            }
            let ok = navigation_autorisee(u);
            if ok {
                adresse(&a1, u, true);
            }
            ok
        })
        .on_page_load(move |_, charge| {
            let fini = matches!(charge.event(), PageLoadEvent::Finished);
            adresse(&a2, charge.url(), !fini);
        })
        .on_document_title_changed(move |_, titre| publier(&a3, |e| e.titre = titre.chars().take(160).collect()))
        // Liens « nouvel onglet » : Steam reste dans le salon, le reste part dans le navigateur.
        .on_new_window(move |u, _| {
            if u.scheme() == "https" && u.host_str().is_some_and(domaine_steam) {
                if let Some(s) = a4.get_webview(STEAM) {
                    let _ = s.navigate(u);
                }
            } else if u.scheme() == "https" {
                let _ = a4.opener().open_url(u.as_str(), None::<&str>);
            }
            NewWindowResponse::Deny
        });
    fenetre.add_child(steam, LogicalPosition::new(0.0, HAUTEUR_BARRE), LogicalSize::new(taille.width, (taille.height - HAUTEUR_BARRE).max(1.0)))?;

    // Garde la barre en haut et Steam en dessous quand la fenêtre change de taille.
    let app2 = app.clone();
    fenetre.on_window_event(move |evenement| match evenement {
        WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => placer(&app2),
        WindowEvent::Destroyed => {
            if let Ok(mut e) = ETAT.lock() {
                *e = None;
            }
        }
        _ => {}
    });
    placer(app);
    Ok(())
}

fn placer(app: &AppHandle) {
    let Some(f) = app.get_window(FENETRE) else { return };
    let (Ok(t), Ok(echelle)) = (f.inner_size(), f.scale_factor()) else { return };
    let t = t.to_logical::<f64>(echelle);
    if let Some(b) = app.get_webview(BARRE) {
        let _ = b.set_position(LogicalPosition::new(0.0, 0.0));
        let _ = b.set_size(LogicalSize::new(t.width, HAUTEUR_BARRE));
    }
    if let Some(s) = app.get_webview(STEAM) {
        let _ = s.set_position(LogicalPosition::new(0.0, HAUTEUR_BARRE));
        let _ = s.set_size(LogicalSize::new(t.width, (t.height - HAUTEUR_BARRE).max(1.0)));
    }
}

/// Actions de la barre. Les retours en arrière passent par l'historique du
/// navigateur (`history.back()`) : une commande de navigation, rien n'est lu.
pub fn action(app: &AppHandle, action: &str) -> Result<(), String> {
    let steam = app.get_webview(STEAM);
    let fenetre = app.get_window(FENETRE);
    let r = match action {
        "retour" => steam.map(|s| s.eval("history.back()")),
        "avancer" => steam.map(|s| s.eval("history.forward()")),
        "recharger" => steam.map(|s| s.reload()),
        "accueil" => steam.map(|s| s.navigate(Url::parse(ACCUEIL).expect("adresse fixe"))),
        "panier" => steam.map(|s| s.navigate(Url::parse(PANIER).expect("adresse fixe"))),
        "navigateur" => {
            let url = etat().map(|e| e.url).unwrap_or_else(|| ACCUEIL.into());
            let sure = Url::parse(&url).ok().filter(|u| u.scheme() == "https").map(|u| u.to_string()).unwrap_or_else(|| ACCUEIL.into());
            return app.opener().open_url(sure, None::<&str>).map_err(|e| e.to_string());
        }
        "reduire" => fenetre.map(|f| f.minimize()),
        "agrandir" => fenetre.map(|f| if f.is_maximized().unwrap_or(false) { f.unmaximize() } else { f.maximize() }),
        "fermer" => fenetre.map(|f| f.close()),
        _ => return Err("action inconnue".into()),
    };
    match r {
        Some(Ok(())) => Ok(()),
        Some(Err(e)) => Err(e.to_string()),
        None => Err("le salon est fermé".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn domaines() {
        assert!(domaine_steam("store.steampowered.com"));
        assert!(domaine_steam("checkout.steampowered.com"));
        assert!(domaine_steam("steamcommunity.com"));
        assert!(!domaine_steam("steampowered.com.evil.com"));
        assert!(!domaine_steam("evilsteampowered.com"));
        assert!(!domaine_steam("www.paypal.com"));
    }

    #[test]
    fn adresses_de_depart() {
        assert!(adresse_depart("https://store.steampowered.com/app/730/").is_some());
        assert!(adresse_depart("http://store.steampowered.com/").is_none());
        assert!(adresse_depart("https://evil.com/").is_none());
        assert!(adresse_depart("https://user:pass@store.steampowered.com/").is_none());
        assert!(adresse_depart("javascript:alert(1)").is_none());
    }

    #[test]
    fn navigation() {
        assert!(navigation_autorisee(&Url::parse("https://www.paypal.com/").unwrap()));
        assert!(!navigation_autorisee(&Url::parse("http://store.steampowered.com/").unwrap()));
        assert!(!navigation_autorisee(&Url::parse("file:///C:/Windows/").unwrap()));
        assert!(!navigation_autorisee(&Url::parse("steam://run/730").unwrap()));
    }
}
