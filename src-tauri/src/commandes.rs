//! Commandes exposées au front (`invoke`). Toutes renvoient `{ code, message }` en cas d'erreur.

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::oneshot;

use crate::cache::{Cache, Donnee};
use crate::erreur::{Erreur, Resultat};
use crate::secrets;
use crate::session::{self, Session};
use crate::steam::auth;
use crate::steam::bibliotheque::{self, Bibliotheque};
use crate::steam::images::{self, ImagesJeu};
use crate::steam::installation::{self, Disque, StatsSysteme};
use crate::steam::liens::{self, ActionSteam};
use crate::steam::magasin::{AvisJeu, FicheJeu, VitrineMagasin};
use crate::steam::notes::{self, PatchNotes};
use crate::steam::pc::{self, ConfigPc};
use crate::steam::redemarrage::{FileSteam, Redemarrage};
use crate::steam::local::{self, Collections, DossierBibliotheque, JeuInstalle};
use crate::steam::webapi::{Actu, JeuPossede, ListeAmis, NiveauBadges, SuccesJeu};
use crate::steam::webapi::{ClientSteam, Joueur};

/// Durée de vie en cache du profil de l'utilisateur.
const TTL_JOUEUR: i64 = 5 * 60;

pub struct EtatApp {
    pub cache: Cache,
    pub steam: ClientSteam,
    pub annulation: Mutex<Option<oneshot::Sender<()>>>,
    /// Installations et désinstallations qui attendent un redémarrage de Steam.
    pub redemarrage: Redemarrage,
}

fn session_requise(app: &AppHandle) -> Resultat<Session> {
    session::lire(app)?.ok_or(Erreur::SessionAbsente)
}

// ——— Session et connexion ———

#[tauri::command]
pub fn session_lire(app: AppHandle) -> Resultat<Option<Session>> {
    session::lire(&app)
}

/// Ouvre le navigateur sur Steam et attend la fin de la connexion.
#[tauri::command]
pub async fn connexion_steam(app: AppHandle, etat: State<'_, EtatApp>) -> Resultat<Session> {
    let (tx, rx) = oneshot::channel();
    if let Ok(mut a) = etat.annulation.lock() {
        // Une connexion déjà en cours est annulée au profit de la nouvelle.
        if let Some(ancienne) = a.replace(tx) {
            let _ = ancienne.send(());
        }
    }
    let resultat = auth::connecter(&app, &etat.steam.http, rx).await;
    if let Ok(mut a) = etat.annulation.lock() {
        a.take();
    }
    let session = Session { steam_id: resultat? };
    session::ecrire(&app, &session)?;
    etat.cache.vider()?;
    Ok(session)
}

#[tauri::command]
pub fn connexion_annuler(etat: State<'_, EtatApp>) {
    if let Ok(mut a) = etat.annulation.lock() {
        if let Some(tx) = a.take() {
            let _ = tx.send(());
        }
    }
}

/// Efface la session et le cache. La clé API est gardée.
#[tauri::command]
pub fn deconnexion(app: AppHandle, etat: State<'_, EtatApp>) -> Resultat<()> {
    session::effacer(&app)?;
    etat.cache.vider()
}

// ——— Clé Steam Web API (jamais renvoyée au front) ———

#[tauri::command]
pub fn cle_etat() -> Resultat<bool> {
    Ok(secrets::lire()?.is_some())
}

/// Vérifie la clé auprès de Steam, puis l'enregistre dans le Gestionnaire d'identifiants Windows.
#[tauri::command]
pub async fn cle_enregistrer(app: AppHandle, etat: State<'_, EtatApp>, cle: String) -> Resultat<()> {
    let cle = secrets::normaliser(&cle);
    if !secrets::format_valide(&cle) {
        return Err(Erreur::CleFormat);
    }
    let session = session_requise(&app)?;
    etat.steam.resume_joueur(&cle, &session.steam_id).await?;
    secrets::ecrire(&cle)?;
    etat.cache.vider()
}

#[tauri::command]
pub fn cle_supprimer(etat: State<'_, EtatApp>) -> Resultat<()> {
    secrets::supprimer()?;
    etat.cache.vider()
}

/// Ouvre la page Steam où l'on crée sa clé (adresse fixe, le front ne choisit pas l'URL).
#[tauri::command]
pub fn ouvrir_page_cle_api(app: AppHandle) -> Resultat<()> {
    app.opener()
        .open_url("https://steamcommunity.com/dev/apikey", None::<&str>)
        .map_err(|_| Erreur::Interne("impossible d'ouvrir le navigateur".into()))
}

// ——— Données Steam ———

/// Profil de l'utilisateur connecté (pseudo, avatar, statut).
#[tauri::command]
pub async fn joueur_moi(app: AppHandle, etat: State<'_, EtatApp>) -> Resultat<Donnee<Joueur>> {
    let session = session_requise(&app)?;
    let cle = secrets::lire()?.ok_or(Erreur::CleAbsente)?;
    let cle_cache = format!("joueur:{}", session.steam_id);
    etat.cache
        .avec_cache(&cle_cache, TTL_JOUEUR, || etat.steam.resume_joueur(&cle, &session.steam_id))
        .await
}

// ——— Étape 2b : lecture locale et données du compte ———

const TTL_BIBLIOTHEQUE: i64 = 60 * 60;
const TTL_RECENTS: i64 = 15 * 60;
const TTL_BADGES: i64 = 60 * 60;
const TTL_AMIS: i64 = 60;
const TTL_SUCCES: i64 = 15 * 60;
const TTL_SCHEMA: i64 = 7 * 24 * 60 * 60;
const TTL_ACTUS: i64 = 30 * 60;

/// Session + clé : nécessaires à tous les appels Web API.
fn identifiants(app: &AppHandle) -> Resultat<(String, String)> {
    let session = session_requise(app)?;
    let cle = secrets::lire()?.ok_or(Erreur::CleAbsente)?;
    Ok((session.steam_id, cle))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InfosSteamLocal {
    pub trouve: bool,
    pub chemin: Option<String>,
    pub bibliotheques: Vec<DossierBibliotheque>,
}

/// Où est Steam sur ce PC, et ses dossiers de bibliothèque.
#[tauri::command]
pub fn steam_local() -> InfosSteamLocal {
    match local::dossier_steam() {
        Some(p) => InfosSteamLocal {
            trouve: true,
            bibliotheques: local::dossiers_bibliotheque(&p),
            chemin: Some(p.to_string_lossy().into_owned()),
        },
        None => InfosSteamLocal { trouve: false, chemin: None, bibliotheques: vec![] },
    }
}

/// Jeux installés et téléchargements en cours (lecture des `appmanifest`, sans cache).
#[tauri::command]
pub fn jeux_installes() -> Resultat<Vec<JeuInstalle>> {
    let steam = local::dossier_steam().ok_or(Erreur::SteamIntrouvable)?;
    Ok(local::jeux_installes(&steam))
}

/// Favoris et collections du compte connecté (fichiers locaux de Steam).
#[tauri::command]
pub fn collections(app: AppHandle) -> Resultat<Collections> {
    let session = session_requise(&app)?;
    let steam = local::dossier_steam().ok_or(Erreur::SteamIntrouvable)?;
    Ok(local::collections(&steam, &session.steam_id))
}

/// Bibliothèque complète : jeux possédés + installation + favoris + collections.
#[tauri::command]
pub async fn bibliotheque(app: AppHandle, etat: State<'_, EtatApp>) -> Resultat<Donnee<Bibliotheque>> {
    let (sid, cle) = identifiants(&app)?;
    let possedes = etat
        .cache
        .avec_cache(&format!("possedes:{sid}"), TTL_BIBLIOTHEQUE, || etat.steam.jeux_possedes(&cle, &sid))
        .await?;
    let steam = local::dossier_steam();
    let installes = steam.as_deref().map(local::jeux_installes).unwrap_or_default();
    let cols = steam.as_deref().map(|s| local::collections(s, &sid)).unwrap_or_default();
    Ok(Donnee {
        donnees: bibliotheque::fusionner(possedes.donnees, &installes, &cols, steam.is_some()),
        hors_ligne: possedes.hors_ligne,
        recupere_le: possedes.recupere_le,
    })
}

/// Jeux joués ces deux dernières semaines.
#[tauri::command]
pub async fn recemment_joues(app: AppHandle, etat: State<'_, EtatApp>) -> Resultat<Donnee<Vec<JeuPossede>>> {
    let (sid, cle) = identifiants(&app)?;
    etat.cache
        .avec_cache(&format!("recents:{sid}"), TTL_RECENTS, || etat.steam.jeux_recents(&cle, &sid))
        .await
}

/// Niveau, XP et badges.
#[tauri::command]
pub async fn niveau_badges(app: AppHandle, etat: State<'_, EtatApp>) -> Resultat<Donnee<NiveauBadges>> {
    let (sid, cle) = identifiants(&app)?;
    etat.cache
        .avec_cache(&format!("badges:{sid}"), TTL_BADGES, || etat.steam.niveau_badges(&cle, &sid))
        .await
}

/// Amis avec leur statut (en jeu d'abord).
#[tauri::command]
pub async fn amis(app: AppHandle, etat: State<'_, EtatApp>) -> Resultat<Donnee<ListeAmis>> {
    let (sid, cle) = identifiants(&app)?;
    etat.cache.avec_cache(&format!("amis:{sid}"), TTL_AMIS, || etat.steam.amis(&cle, &sid)).await
}

/// Succès d'un jeu (`None` si le jeu n'en a pas).
#[tauri::command]
pub async fn succes_jeu(app: AppHandle, etat: State<'_, EtatApp>, app_id: u32) -> Resultat<Donnee<Option<SuccesJeu>>> {
    let (sid, cle) = identifiants(&app)?;
    let schema = etat
        .cache
        .avec_cache(&format!("schema:{app_id}"), TTL_SCHEMA, || etat.steam.schema_succes(&cle, app_id))
        .await
        .map(|d| d.donnees)
        .unwrap_or_default();
    etat.cache
        .avec_cache(&format!("succes:{sid}:{app_id}"), TTL_SUCCES, || {
            etat.steam.succes(&cle, &sid, app_id, &schema)
        })
        .await
}

/// Dernières actus et patch notes d'un jeu.
#[tauri::command]
pub async fn actus_jeu(etat: State<'_, EtatApp>, app_id: u32) -> Resultat<Donnee<Vec<Actu>>> {
    etat.cache.avec_cache(&format!("actus:{app_id}"), TTL_ACTUS, || etat.steam.actus(app_id)).await
}

// ——— Étape 3 : accueil ———

const TTL_IMAGES: i64 = 7 * 24 * 60 * 60;

/// Adresses des images (jaquette, hero, bannière) de plusieurs jeux.
/// Cache d'une semaine par jeu ; sans réseau, adresses classiques.
#[tauri::command]
pub async fn images_jeux(etat: State<'_, EtatApp>, app_ids: Vec<u32>) -> Resultat<HashMap<u32, ImagesJeu>> {
    let mut resultat = HashMap::new();
    let mut manquants = Vec::new();
    for id in app_ids.into_iter().take(150) {
        match etat.cache.frais::<ImagesJeu>(&format!("images3:{id}"))? {
            Some(i) => {
                resultat.insert(id, i);
            }
            None => manquants.push(id),
        }
    }
    if !manquants.is_empty() {
        match etat.steam.images(&manquants).await {
            Ok(trouvees) => {
                for (id, i) in trouvees {
                    etat.cache.ranger(&format!("images3:{id}"), &i, TTL_IMAGES)?;
                    resultat.insert(id, i);
                }
            }
            Err(e) if e.est_passagere() => {
                for id in manquants {
                    resultat.insert(id, images::adresses_classiques(id));
                }
            }
            Err(e) => return Err(e),
        }
    }
    Ok(resultat)
}

/// Ouvre un lien `steam://` construit et vérifié côté Rust (jouer, installer, rejoindre…).
#[tauri::command]
pub fn steam_lien(app: AppHandle, action: ActionSteam) -> Resultat<()> {
    let lien = liens::construire(&action).ok_or_else(|| Erreur::Interne("lien Steam refusé".into()))?;
    app.opener()
        .open_url(lien, None::<&str>)
        .map_err(|_| Erreur::Interne("impossible d'ouvrir Steam".into()))
}

/// Dernières patch notes d'un jeu, nettoyées et triées par catégorie.
#[tauri::command]
pub async fn patch_notes(etat: State<'_, EtatApp>, app_id: u32) -> Resultat<Donnee<Option<PatchNotes>>> {
    let actus = etat.cache.avec_cache(&format!("actus:{app_id}"), TTL_ACTUS, || etat.steam.actus(app_id)).await?;
    Ok(Donnee {
        donnees: notes::depuis_actus(&actus.donnees),
        hors_ligne: actus.hors_ligne,
        recupere_le: actus.recupere_le,
    })
}

// ——— Installation sans la fenêtre de Steam ———

const TTL_CONFIG: i64 = 7 * 24 * 60 * 60;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OptionsInstallation {
    pub nom: String,
    /// Estimation tirée de la configuration minimale du magasin.
    pub taille_estimee: Option<u64>,
    pub disques: Vec<Disque>,
    /// Jeu lancé en ce moment : l'installation attendra (Steam doit redémarrer).
    pub jeu_en_cours: Option<u32>,
    pub deja_installe: bool,
}

/// Ce qu'il faut pour la fenêtre d'installation : taille, disques et espace libre.
#[tauri::command]
pub async fn options_installation(etat: State<'_, EtatApp>, app_id: u32, nom: String) -> Resultat<OptionsInstallation> {
    let steam = local::dossier_steam().ok_or(Erreur::SteamIntrouvable)?;
    let config = etat
        .cache
        .avec_cache(&format!("config:{app_id}"), TTL_CONFIG, || etat.steam.config_magasin(app_id))
        .await
        .map(|d| d.donnees)
        .ok();
    Ok(OptionsInstallation {
        nom: config.as_ref().and_then(|c| c.nom.clone()).unwrap_or(nom),
        taille_estimee: config.and_then(|c| c.taille),
        disques: installation::disques(&steam),
        jeu_en_cours: installation::jeu_en_cours(),
        deja_installe: installation::deja_installe(&steam, app_id),
    })
}

/// Lance l'installation sans fenêtre Steam : manifeste dans la bibliothèque choisie,
/// raccourcis demandés, puis redémarrage de Steam en arrière-plan. Si un jeu tourne,
/// le redémarrage attend qu'il se ferme (file de `redemarrage.rs`).
#[tauri::command]
pub async fn installer_jeu(
    app: AppHandle,
    etat: State<'_, EtatApp>,
    app_id: u32,
    nom: String,
    bibliotheque: String,
    raccourci_bureau: bool,
    raccourci_menu: bool,
) -> Resultat<FileSteam> {
    let (sid, cle) = identifiants(&app)?;
    let steam = local::dossier_steam().ok_or(Erreur::SteamIntrouvable)?;
    if etat.redemarrage.lire().desinstallations.contains(&app_id) {
        return Err(Erreur::Interne("ce jeu attend sa désinstallation : annule-la plutôt".into()));
    }
    // Le jeu doit être dans la bibliothèque du compte.
    let possedes = etat
        .cache
        .avec_cache(&format!("possedes:{sid}"), TTL_BIBLIOTHEQUE, || etat.steam.jeux_possedes(&cle, &sid))
        .await?;
    if !possedes.donnees.iter().any(|j| j.app_id == app_id) {
        return Err(Erreur::Interne("ce jeu n'est pas dans ta bibliothèque Steam".into()));
    }
    installation::ecrire_manifeste(&steam, &bibliotheque, app_id, &nom, &sid)?;
    if raccourci_bureau {
        if let Ok(bureau) = app.path().desktop_dir() {
            let _ = installation::creer_raccourci(&bureau, app_id, &nom, &steam);
        }
    }
    if raccourci_menu {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let menu = std::path::Path::new(&appdata).join(r"Microsoft\Windows\Start Menu\Programs\Steam");
            let _ = installation::creer_raccourci(&menu, app_id, &nom, &steam);
        }
    }
    etat.redemarrage.ajouter_installation(&app, app_id);
    Ok(etat.redemarrage.lire())
}

/// Désinstalle un jeu sans la fenêtre de Steam : Steam est fermé, les fichiers du jeu
/// supprimés, puis Steam relancé en arrière-plan. Attend la fin du jeu en cours.
#[tauri::command]
pub async fn desinstaller_jeu(app: AppHandle, etat: State<'_, EtatApp>, app_id: u32) -> Resultat<FileSteam> {
    let steam = local::dossier_steam().ok_or(Erreur::SteamIntrouvable)?;
    if !installation::deja_installe(&steam, app_id) {
        return Err(Erreur::Interne("ce jeu n'est pas installé".into()));
    }
    etat.redemarrage.ajouter_desinstallation(&app, app_id);
    Ok(etat.redemarrage.lire())
}

/// File des opérations en attente d'un redémarrage de Steam.
#[tauri::command]
pub fn file_steam(etat: State<'_, EtatApp>) -> FileSteam {
    etat.redemarrage.lire()
}

/// Retire une installation ou une désinstallation de la file (avant le redémarrage).
#[tauri::command]
pub fn annuler_file_steam(app: AppHandle, etat: State<'_, EtatApp>, app_id: u32) -> Resultat<FileSteam> {
    etat.redemarrage.annuler(&app, app_id)?;
    Ok(etat.redemarrage.lire())
}

/// Réseau, écriture disque de Steam et espace libre (compteurs cumulés).
#[tauri::command]
pub async fn stats_systeme() -> StatsSysteme {
    tauri::async_runtime::spawn_blocking(installation::stats_systeme)
        .await
        .unwrap_or_else(|_| StatsSysteme { horodatage_ms: 0, reseau_recu: 0, steam_ecrit: None, disques: vec![] })
}

// ——— Étape 5 : magasin et fiche d'un jeu ———

const TTL_FICHE: i64 = 6 * 60 * 60;
const TTL_AVIS: i64 = 6 * 60 * 60;
const TTL_VITRINE: i64 = 30 * 60;

/// Fiche du magasin d'un jeu (description, prix, médias, configuration requise).
#[tauri::command]
pub async fn fiche_jeu(etat: State<'_, EtatApp>, app_id: u32) -> Resultat<Donnee<FicheJeu>> {
    etat.cache.avec_cache(&format!("fiche:{app_id}"), TTL_FICHE, || etat.steam.fiche_jeu(app_id)).await
}

/// Évaluations des joueurs (toutes langues et en français).
#[tauri::command]
pub async fn avis_jeu(etat: State<'_, EtatApp>, app_id: u32) -> Resultat<Donnee<AvisJeu>> {
    etat.cache.avec_cache(&format!("avis:{app_id}"), TTL_AVIS, || etat.steam.avis_jeu(app_id)).await
}

/// Offres, meilleures ventes et nouveautés du magasin.
#[tauri::command]
pub async fn vitrine_magasin(etat: State<'_, EtatApp>) -> Resultat<Donnee<VitrineMagasin>> {
    etat.cache.avec_cache("vitrine", TTL_VITRINE, || etat.steam.vitrine_magasin()).await
}

/// Configuration de ce PC (comparaison avec la configuration requise).
#[tauri::command]
pub async fn config_pc() -> Resultat<ConfigPc> {
    tauri::async_runtime::spawn_blocking(pc::config_pc)
        .await
        .map_err(|e| Erreur::Interne(format!("lecture de la configuration : {e}")))
}
