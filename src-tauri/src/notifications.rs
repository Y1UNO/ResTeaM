//! Notifications Windows (étape « Notifications ») :
//! - téléchargement terminé, mise à jour prête (lecture des `appmanifest`, toutes les 8 s) ;
//! - un ami lance un jeu (`GetPlayerSummaries` des amis, toutes les 90 s) ;
//! - une promo dans la liste de souhaits (toutes les 6 h ; chaque promo n'est annoncée qu'une fois).
//!
//! Chaque type se coupe dans les Paramètres. ResTeaM n'étant pas installé par un
//! installeur, il s'inscrit lui-même auprès de Windows (`AppUserModelId` de
//! l'utilisateur : nom et icône) pour que ses notifications portent son nom.
//! Un clic sur une notification remet ResTeaM à l'écran.

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::time::Duration;

use tauri::{AppHandle, Manager};

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

/// Affiche une notification Windows (sans attendre). Un clic remet ResTeaM à l'écran.
pub fn envoyer(app: &AppHandle, titre: String, texte: String) {
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
                match a {
                    Annonce::Termine(id) if p.notif_telechargement => {
                        envoyer(&app, "Téléchargement terminé".into(), format!("{} est prêt à jouer.", noms.get(&id).cloned().unwrap_or_default()))
                    }
                    Annonce::MiseAJour(id) if p.notif_maj => {
                        envoyer(&app, "Mise à jour prête".into(), format!("{} est à jour.", noms.get(&id).cloned().unwrap_or_default()))
                    }
                    _ => {}
                }
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
        let pseudos: HashMap<String, String> = liste.amis.iter().map(|a| (a.joueur.steam_id.clone(), a.joueur.pseudo.clone())).collect();
        let apres: HashMap<String, Option<String>> = liste.amis.into_iter().map(|a| (a.joueur.steam_id, a.joueur.jeu_en_cours)).collect();
        if let Some(avant) = &avant {
            let lances = amis_lances(avant, &apres);
            // Pas d'avalanche : au-delà de 3, un seul résumé.
            if lances.len() > 3 {
                envoyer(&app, "Tes amis jouent".into(), format!("{} amis viennent de lancer un jeu.", lances.len()));
            } else {
                for (id, jeu) in lances {
                    envoyer(&app, format!("{} est en jeu", pseudos.get(&id).cloned().unwrap_or_default()), jeu);
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
            (!annoncees.contains(&cle)).then(|| (cle, p.nom.clone(), prix.reduction, prix.texte_final.clone()))
        })
        .collect();
    if nouvelles.len() > 3 {
        envoyer(app, "Promos dans ta liste de souhaits".into(), format!("{} jeux de ta liste sont en promotion.", nouvelles.len()));
    } else {
        for (_, nom, reduction, prix) in &nouvelles {
            envoyer(app, format!("{nom} : -{reduction} %"), format!("En promo à {prix} dans ta liste de souhaits."));
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
    fn cles_de_promo() {
        assert_eq!(cle_promo(730, 50, Some(9)), "730:50:9");
        assert_ne!(cle_promo(730, 50, None), cle_promo(730, 60, None));
    }
}
