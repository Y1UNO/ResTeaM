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
use crate::steam::images::ImagesJeu;
use crate::steam::installation::{self, Disque, StatsSysteme};
use crate::steam::liens::{self, ActionSteam};
use crate::steam::boutique::{Produit, Souhait};
use crate::steam::classements::{self, Classements, EnLigne, Releve};
use crate::steam::magasin::{AvisJeu, FicheJeu, VitrineMagasin};
use crate::steam::notes::{self, PatchNotes};
use crate::steam::parametres::{self, ParametresSteam, ReglageSteam};
use crate::steam::proprietes::{self, Proprietes, Reglage};
use crate::steam::pc::{self, ConfigPc};
use crate::steam::redemarrage::{FileSteam, Redemarrage};
use crate::steam::local::{self, Collections, DossierBibliotheque, JeuInstalle};
use crate::steam::webapi::{Actu, JeuPossede, ListeAmis, NiveauBadges, SuccesJeu};
use crate::steam::webapi::{ClientSteam, Joueur, ObjetsProfil};

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
    etat.cache.avec_cache(&format!("actus2:{app_id}"), TTL_ACTUS, || etat.steam.actus(app_id)).await
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
        match etat.cache.frais::<ImagesJeu>(&format!("images5:{id}"))? {
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
                    etat.cache.ranger(&format!("images5:{id}"), &i, TTL_IMAGES)?;
                    resultat.insert(id, i);
                }
            }
            // Erreur passagère (quota, réseau) : on renvoie l'erreur pour que le front
            // réessaie. Avant, les adresses classiques étaient gardées toute la session,
            // et elles n'existent pas pour les jeux récents (jaquettes vides).
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
    let actus = etat.cache.avec_cache(&format!("actus2:{app_id}"), TTL_ACTUS, || etat.steam.actus(app_id)).await?;
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
    let Some(possede) = possedes.donnees.iter().find(|j| j.app_id == app_id) else {
        return Err(Erreur::Interne("ce jeu n'est pas dans ta bibliothèque Steam".into()));
    };
    // Audit (étape 9) : le nom écrit dans le manifeste et les raccourcis est celui de Steam.
    let nom = if possede.nom.trim().is_empty() { nom } else { possede.nom.clone() };
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
    // Audit (étape 9) : jamais les outils de Steam (redistribuables partagés).
    if local::est_outil(app_id) {
        return Err(Erreur::Interne("ce composant de Steam ne se désinstalle pas".into()));
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
    etat.cache.avec_cache(&format!("fiche3:{app_id}"), TTL_FICHE, || etat.steam.fiche_jeu(app_id)).await
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

// ——— Boutique complète : recherche, rayons, liste de souhaits ———

const TTL_PRODUIT: i64 = 3 * 60 * 60;
const TTL_TAGS: i64 = 7 * 24 * 60 * 60;
const TTL_RECHERCHE: i64 = 10 * 60;
const TTL_RAYON: i64 = 30 * 60;
const TTL_SOUHAITS: i64 = 10 * 60;

/// Fiches courtes, depuis le cache (3 h) ou Steam pour celles qui manquent.
async fn produits_caches(etat: &EtatApp, app_ids: &[u32]) -> Resultat<Vec<Produit>> {
    let mut connus = HashMap::new();
    let mut manquants = Vec::new();
    for id in app_ids.iter().copied().take(100) {
        match etat.cache.frais::<Produit>(&format!("produit2:{id}"))? {
            Some(p) => {
                connus.insert(id, p);
            }
            None => manquants.push(id),
        }
    }
    if !manquants.is_empty() {
        let tags = etat.cache.avec_cache("tags-fr", TTL_TAGS, || etat.steam.noms_tags()).await?.donnees;
        for p in etat.steam.produits(&manquants, &tags).await? {
            etat.cache.ranger(&format!("produit2:{}", p.app_id), &p, TTL_PRODUIT)?;
            connus.insert(p.app_id, p);
        }
    }
    Ok(app_ids.iter().filter_map(|id| connus.remove(id)).collect())
}

/// Fiches courtes de plusieurs jeux (images, prix, avis, tags, captures).
#[tauri::command]
pub async fn produits_magasin(etat: State<'_, EtatApp>, app_ids: Vec<u32>) -> Resultat<Vec<Produit>> {
    produits_caches(&etat, &app_ids).await
}

/// Recherche de jeux par nom dans le magasin.
#[tauri::command]
pub async fn recherche_magasin(etat: State<'_, EtatApp>, terme: String) -> Resultat<Vec<Produit>> {
    let terme = terme.trim().to_lowercase();
    if terme.chars().count() < 2 || terme.chars().count() > 60 {
        return Ok(vec![]);
    }
    let ids = etat
        .cache
        .avec_cache(&format!("recherche:{terme}"), TTL_RECHERCHE, || etat.steam.recherche_ids(&terme))
        .await?
        .donnees;
    produits_caches(&etat, &ids).await
}

/// Rayon du magasin (`gratuits` ou `tag:<id>`), par meilleures ventes.
#[tauri::command]
pub async fn rayon_magasin(etat: State<'_, EtatApp>, rayon: String) -> Resultat<Vec<Produit>> {
    let ids = etat
        .cache
        .avec_cache(&format!("rayon:{rayon}"), TTL_RAYON, || etat.steam.rayon_ids(&rayon))
        .await?
        .donnees;
    produits_caches(&etat, &ids).await
}

/// Liste de souhaits du compte connecté (ordre choisi dans Steam).
#[tauri::command]
pub async fn liste_souhaits(app: AppHandle, etat: State<'_, EtatApp>) -> Resultat<Donnee<Vec<Souhait>>> {
    let session = session_requise(&app)?;
    let sid = session.steam_id;
    etat.cache.avec_cache(&format!("souhaits:{sid}"), TTL_SOUHAITS, || etat.steam.souhaits(&sid)).await
}

// ——— Étape 7 : classements ———

const TTL_CLASSEMENTS: i64 = 60 * 60;
const TTL_EN_LIGNE: i64 = 3 * 60;

/// Jeux les plus joués et meilleures ventes de la semaine (top 100 chacun).
#[tauri::command]
pub async fn classements(etat: State<'_, EtatApp>) -> Resultat<Donnee<Classements>> {
    etat.cache
        .avec_cache("classements", TTL_CLASSEMENTS, || async {
            let (joues, ventes) = tokio::join!(etat.steam.plus_joues(), etat.steam.meilleures_ventes());
            Ok(Classements { plus_joues: joues?, meilleures_ventes: ventes.unwrap_or_default() })
        })
        .await
}

/// Joueurs en jeu sur le top 10 des plus joués, avec les relevés des dernières 24 h.
#[tauri::command]
pub async fn en_ligne(etat: State<'_, EtatApp>) -> Resultat<Donnee<EnLigne>> {
    etat.cache
        .avec_cache("en-ligne", TTL_EN_LIGNE, || async {
            let top = etat
                .cache
                .avec_cache("classements", TTL_CLASSEMENTS, || async {
                    Ok(Classements { plus_joues: etat.steam.plus_joues().await?, meilleures_ventes: vec![] })
                })
                .await?
                .donnees
                .plus_joues;
            let ids: Vec<u32> = top.iter().take(10).map(|c| c.app_id).collect();
            let mut taches = Vec::new();
            for id in ids {
                let steam = etat.steam.http.clone();
                taches.push(tauri::async_runtime::spawn(async move {
                    ClientSteam { http: steam }.joueurs_en_jeu(id).await.unwrap_or(0)
                }));
            }
            let mut joueurs = 0;
            for t in taches {
                joueurs += t.await.unwrap_or(0);
            }
            if joueurs == 0 {
                return Err(Erreur::Reseau);
            }
            let anciens = etat.cache.frais::<Vec<Releve>>("releves-en-ligne")?.unwrap_or_default();
            let releves = classements::ajouter_releve(anciens, Releve { le: crate::cache::maintenant(), joueurs });
            etat.cache.ranger("releves-en-ligne", &releves, 2 * 24 * 3600)?;
            Ok(EnLigne { joueurs, releves })
        })
        .await
}

// ——— Étape 8 : amis qui possèdent un jeu ———

const TTL_IDS_AMI: i64 = 24 * 60 * 60;

/// Amis (SteamID) qui possèdent ce jeu. La bibliothèque de chaque ami est gardée
/// 24 h en cache ; un profil privé compte comme « ne le possède pas ».
#[tauri::command]
pub async fn amis_possedant(app: AppHandle, etat: State<'_, EtatApp>, app_id: u32) -> Resultat<Vec<String>> {
    let (sid, cle) = identifiants(&app)?;
    let amis = etat.cache.avec_cache(&format!("amis:{sid}"), TTL_AMIS, || etat.steam.amis(&cle, &sid)).await?.donnees;
    let mut resultat = Vec::new();
    let mut a_lire = Vec::new();
    for ami in &amis.amis {
        match etat.cache.frais::<Vec<u32>>(&format!("ids-possedes:{}", ami.joueur.steam_id))? {
            Some(ids) => {
                if ids.contains(&app_id) {
                    resultat.push(ami.joueur.steam_id.clone());
                }
            }
            None => a_lire.push(ami.joueur.steam_id.clone()),
        }
    }
    // Par paquets de 8 requêtes en parallèle, pour ne pas inonder Steam.
    for paquet in a_lire.chunks(8) {
        let mut taches = Vec::new();
        for id in paquet {
            let client = ClientSteam { http: etat.steam.http.clone() };
            let (cle, id) = (cle.clone(), id.clone());
            taches.push(tauri::async_runtime::spawn(async move {
                let ids = client.ids_possedes(&cle, &id).await.unwrap_or_default();
                (id, ids)
            }));
        }
        for t in taches {
            if let Ok((id, ids)) = t.await {
                etat.cache.ranger(&format!("ids-possedes:{id}"), &ids, TTL_IDS_AMI)?;
                if ids.contains(&app_id) {
                    resultat.push(id);
                }
            }
        }
    }
    Ok(resultat)
}

// ——— Profil d'un ami ———

const TTL_PROFIL_AMI: i64 = 10 * 60;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfilJoueur {
    pub joueur: Joueur,
    /// `None` si Steam ne le montre pas (profil privé).
    pub niveau: Option<NiveauBadges>,
    pub jeux: Option<Vec<JeuPossede>>,
    pub recents: Option<Vec<JeuPossede>>,
}

const TTL_TROPHEES: i64 = 6 * 60 * 60;

/// Trophées d'un joueur (le compte connecté si `steam_id` est absent) : total, jeux à
/// 100 %, le plus rare et le dernier obtenu. Profil privé → erreur « privé ».
#[tauri::command]
pub async fn bilan_trophees(app: AppHandle, etat: State<'_, EtatApp>, steam_id: Option<String>) -> Resultat<Donnee<crate::steam::trophees::BilanTrophees>> {
    let (moi, cle) = identifiants(&app)?;
    let sid = steam_id.unwrap_or(moi);
    if !session::steam_id_valide(&sid) {
        return Err(Erreur::Interne("identifiant Steam invalide".into()));
    }
    etat.cache
        .avec_cache(&format!("trophees:{sid}"), TTL_TROPHEES, || async {
            let jeux = etat.steam.jeux_possedes(&cle, &sid).await?;
            if jeux.is_empty() {
                return Err(Erreur::Prive);
            }
            let joues: Vec<u32> = jeux.iter().filter(|j| j.minutes_total > 0).map(|j| j.app_id).collect();
            let (progres, plus_rare) = etat.steam.bilan_trophees(&cle, &sid, &joues).await?;
            // Dernier trophée : parmi les 5 jeux les plus récemment lancés qui en ont.
            let mut recents: Vec<&crate::steam::webapi::JeuPossede> = jeux.iter().filter(|j| progres.iter().any(|p| p.app_id == j.app_id && p.debloques > 0)).collect();
            recents.sort_by_key(|j| -j.dernier_lancement);
            let mut dernier: Option<crate::steam::trophees::DernierTrophee> = None;
            for j in recents.into_iter().take(5) {
                let schema = etat
                    .cache
                    .avec_cache(&format!("schema:{}", j.app_id), TTL_SCHEMA, || etat.steam.schema_succes(&cle, j.app_id))
                    .await
                    .map(|d| d.donnees)
                    .unwrap_or_default();
                let Ok(Some(s)) = etat.steam.succes(&cle, &sid, j.app_id, &schema).await else { continue };
                for x in s.succes.into_iter().filter(|x| x.debloque) {
                    let date = x.debloque_le.unwrap_or(0);
                    if dernier.as_ref().is_none_or(|d| date > d.date) {
                        dernier = Some(crate::steam::trophees::DernierTrophee { app_id: j.app_id, nom: x.nom, icone: x.icone, date });
                    }
                }
            }
            Ok(crate::steam::trophees::BilanTrophees::depuis(&progres, plus_rare, dernier))
        })
        .await
}

/// Profil d'un autre joueur (un ami) : résumé, niveau et badges, jeux, jeux récents.
/// Chaque partie privée revient vide au lieu de faire échouer le tout.
#[tauri::command]
pub async fn profil_joueur(app: AppHandle, etat: State<'_, EtatApp>, steam_id: String) -> Resultat<Donnee<ProfilJoueur>> {
    if steam_id.len() != 17 || !steam_id.bytes().all(|b| b.is_ascii_digit()) {
        return Err(Erreur::Interne("identifiant Steam invalide".into()));
    }
    let (_, cle) = identifiants(&app)?;
    etat.cache
        .avec_cache(&format!("profil:{steam_id}"), TTL_PROFIL_AMI, || async {
            let (joueur, niveau, jeux, recents) = tokio::join!(
                etat.steam.resume_joueur(&cle, &steam_id),
                etat.steam.niveau_badges(&cle, &steam_id),
                etat.steam.jeux_possedes(&cle, &steam_id),
                etat.steam.jeux_recents(&cle, &steam_id),
            );
            Ok(ProfilJoueur {
                joueur: joueur?,
                niveau: niveau.ok(),
                jeux: jeux.ok().filter(|j| !j.is_empty()),
                recents: recents.ok(),
            })
        })
        .await
}

// ——— Étape 10 : propriétés d'un jeu ———

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProprietesJeu {
    #[serde(flatten)]
    pub proprietes: Proprietes,
    /// Réglage demandé, pas encore écrit (Steam pas encore redémarré).
    pub en_attente: Option<Reglage>,
}

/// Propriétés d'un jeu lues dans les fichiers de Steam, plus le réglage en attente.
#[tauri::command]
pub async fn proprietes_jeu(app: AppHandle, etat: State<'_, EtatApp>, app_id: u32) -> Resultat<ProprietesJeu> {
    let session = session_requise(&app)?;
    let steam = local::dossier_steam().ok_or(Erreur::SteamIntrouvable)?;
    let sid = session.steam_id.clone();
    let proprietes = tauri::async_runtime::spawn_blocking(move || proprietes::lire(&steam, &sid, app_id))
        .await
        .map_err(|e| Erreur::Interne(e.to_string()))?;
    let en_attente = etat.redemarrage.lire().reglages.into_iter().find(|r| r.app_id == app_id);
    Ok(ProprietesJeu { proprietes, en_attente })
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemandeReglage {
    pub app_id: u32,
    pub options_lancement: Option<String>,
    pub maj_auto: Option<u8>,
    pub telechargements_en_jeu: Option<u8>,
}

/// Met un réglage dans la file : Steam redémarre caché (après le jeu en cours) et le
/// réglage est écrit pendant qu'il est fermé.
#[tauri::command]
pub async fn regler_jeu(app: AppHandle, etat: State<'_, EtatApp>, demande: DemandeReglage) -> Resultat<FileSteam> {
    let session = session_requise(&app)?;
    let r = Reglage {
        app_id: demande.app_id,
        compte: session.steam_id,
        options_lancement: demande.options_lancement.map(|o| o.trim().to_string()),
        maj_auto: demande.maj_auto,
        telechargements_en_jeu: demande.telechargements_en_jeu,
    };
    r.valider()?;
    if r.options_lancement.is_none() && r.maj_auto.is_none() && r.telechargements_en_jeu.is_none() {
        return Ok(etat.redemarrage.lire());
    }
    etat.redemarrage.ajouter_reglage(&app, r);
    Ok(etat.redemarrage.lire())
}

// ——— Préférences de ResTeaM et jeu en cours ———

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreferencesEtat {
    pub preferences: crate::preferences::Preferences,
    pub demarrage_windows: bool,
}

#[tauri::command]
pub fn preferences_lire(app: AppHandle) -> PreferencesEtat {
    PreferencesEtat { preferences: crate::preferences::lire(&app), demarrage_windows: crate::preferences::demarrage_windows() }
}

#[tauri::command]
pub fn preferences_ecrire(etat: State<'_, crate::preferences::EtatPreferences>, preferences: crate::preferences::Preferences) -> Resultat<()> {
    etat.ecrire(preferences)
}

/// Lancement de ResTeaM avec Windows (caché dans la zone de notification).
#[tauri::command]
pub fn resteam_au_demarrage(actif: bool) -> Resultat<bool> {
    crate::preferences::regler_demarrage_windows(actif)?;
    Ok(crate::preferences::demarrage_windows())
}

/// Notification Windows d'essai (bouton des Paramètres).
#[tauri::command]
pub fn notification_essai(app: AppHandle) {
    crate::notifications::envoyer(&app, "ResTeaM".into(), "Les notifications fonctionnent. Un clic ici rouvre ResTeaM.".into());
}

/// Jeu en cours et dernière session terminée.
#[tauri::command]
pub fn jeu_session() -> crate::jeu::EtatJeu {
    crate::jeu::etat()
}

// ——— Paramètres de Steam ———

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParametresSteamEtat {
    pub parametres: ParametresSteam,
    /// Changements en attente du prochain redémarrage de Steam.
    pub en_attente: Option<ReglageSteam>,
    pub file: FileSteam,
}

/// Paramètres de Steam lus sur le disque, et ceux en attente dans la file.
#[tauri::command]
pub async fn parametres_steam(app: AppHandle, etat: State<'_, EtatApp>) -> Resultat<ParametresSteamEtat> {
    let session = session_requise(&app)?;
    let steam = local::dossier_steam().ok_or(Erreur::SteamIntrouvable)?;
    let parametres = tauri::async_runtime::spawn_blocking(move || parametres::lire(&steam, &session.steam_id))
        .await
        .map_err(|e| Erreur::Interne(e.to_string()))?;
    let file = etat.redemarrage.lire();
    Ok(ParametresSteamEtat { parametres, en_attente: file.reglage_steam.clone(), file })
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemandeReglageSteam {
    pub limite_kbps: Option<u32>,
    pub telechargements_en_jeu: Option<bool>,
    pub ralentir_streaming: Option<bool>,
    pub overlay: Option<bool>,
}

/// Met des paramètres de Steam dans la file : Steam redémarre caché (après le jeu
/// en cours) et ils sont écrits pendant qu'il est fermé.
#[tauri::command]
pub async fn regler_steam(app: AppHandle, etat: State<'_, EtatApp>, demande: DemandeReglageSteam) -> Resultat<FileSteam> {
    let session = session_requise(&app)?;
    let r = ReglageSteam {
        compte: session.steam_id,
        limite_kbps: demande.limite_kbps,
        telechargements_en_jeu: demande.telechargements_en_jeu,
        ralentir_streaming: demande.ralentir_streaming,
        overlay: demande.overlay,
    };
    r.valider()?;
    if !r.vide() {
        etat.redemarrage.ajouter_reglage_steam(&app, r);
    }
    Ok(etat.redemarrage.lire())
}

/// Retire les paramètres de Steam en attente.
#[tauri::command]
pub fn annuler_reglage_steam(app: AppHandle, etat: State<'_, EtatApp>) -> Resultat<FileSteam> {
    etat.redemarrage.annuler_reglage_steam(&app)?;
    Ok(etat.redemarrage.lire())
}

/// Démarrage de Steam avec Windows : appliqué tout de suite (registre de l'utilisateur).
#[tauri::command]
pub fn steam_au_demarrage(actif: bool) -> Resultat<bool> {
    let steam = local::dossier_steam().ok_or(Erreur::SteamIntrouvable)?;
    parametres::regler_demarrage_windows(&steam, actif)?;
    Ok(parametres::demarrage_windows())
}

/// Ouvre un dossier de bibliothèque de Steam dans l'Explorateur (seulement ceux
/// déclarés dans `libraryfolders.vdf`).
#[tauri::command]
pub fn ouvrir_bibliotheque_steam(app: AppHandle, chemin: String) -> Resultat<()> {
    let steam = local::dossier_steam().ok_or(Erreur::SteamIntrouvable)?;
    let connu = local::dossiers_bibliotheque(&steam).into_iter().any(|b| b.chemin == chemin);
    if !connu {
        return Err(Erreur::Interne("dossier inconnu".into()));
    }
    app.opener()
        .open_path(std::path::Path::new(&chemin).join("steamapps").to_string_lossy(), None::<&str>)
        .map_err(|_| Erreur::Interne("impossible d'ouvrir le dossier".into()))
}

/// Ouvre le dossier d'installation du jeu dans l'Explorateur.
#[tauri::command]
pub async fn ouvrir_dossier_jeu(app: AppHandle, app_id: u32) -> Resultat<()> {
    let session = session_requise(&app)?;
    let steam = local::dossier_steam().ok_or(Erreur::SteamIntrouvable)?;
    let p = proprietes::lire(&steam, &session.steam_id, app_id);
    let dossier = p.dossier.filter(|d| std::path::Path::new(d).is_dir()).ok_or_else(|| Erreur::Interne("dossier du jeu introuvable".into()))?;
    app.opener()
        .open_path(dossier, None::<&str>)
        .map_err(|e| Erreur::Interne(format!("ouverture du dossier : {e}")))
}

/// Nom simplifié pour comparer « Apex Legends™ » et « Apex Legends™ - Pack… ».
fn nom_simple(s: &str) -> String {
    s.chars().filter(|c| c.is_alphanumeric() || *c == ' ').collect::<String>().to_lowercase().split_whitespace().collect::<Vec<_>>().join(" ")
}

/// DLC d'un jeu : la liste du magasin, ou à défaut une recherche par nom dans la
/// catégorie DLC (gardée si le nom du DLC commence par celui du jeu).
#[tauri::command]
pub async fn dlc_jeu(etat: State<'_, EtatApp>, app_id: u32) -> Resultat<Vec<Produit>> {
    let fiche = etat.cache.avec_cache(&format!("fiche3:{app_id}"), TTL_FICHE, || etat.steam.fiche_jeu(app_id)).await?.donnees;
    if !fiche.dlc.is_empty() {
        return produits_caches(&etat, &fiche.dlc).await;
    }
    let base = nom_simple(&fiche.nom);
    if base.is_empty() {
        return Ok(vec![]);
    }
    let ids = etat
        .cache
        .avec_cache(&format!("dlc-recherche:{app_id}"), 24 * 3600, || etat.steam.dlc_par_recherche(&fiche.nom))
        .await?
        .donnees;
    let produits = produits_caches(&etat, &ids).await?;
    Ok(produits.into_iter().filter(|p| p.app_id != app_id && nom_simple(&p.nom).starts_with(&base)).collect())
}

/// Objets de profil Steam équipés (le sien ou ceux d'un ami), cache d'une heure.
#[tauri::command]
pub async fn objets_profil(etat: State<'_, EtatApp>, steam_id: String) -> Resultat<Donnee<ObjetsProfil>> {
    if steam_id.len() != 17 || !steam_id.bytes().all(|b| b.is_ascii_digit()) {
        return Err(Erreur::Interne("identifiant Steam invalide".into()));
    }
    etat.cache
        .avec_cache(&format!("objets-profil:{steam_id}"), 60 * 60, || etat.steam.objets_profil(&steam_id))
        .await
}

// ——— Avatar et bannière perso (fichiers choisis par Tom) ———

/// Enregistre l'avatar ou la bannière choisis sur le PC (image, GIF ou vidéo, sans
/// limite de poids). Le fichier arrive en binaire brut ; les en-têtes `x-nom`
/// (`avatar` / `banniere`) et `x-type` (type MIME) disent ce que c'est.
/// Renvoie l'adresse locale à afficher.
#[tauri::command]
pub async fn enregistrer_media_perso(app: AppHandle, request: tauri::ipc::Request<'_>) -> Resultat<String> {
    let entete = |n: &str| request.headers().get(n).and_then(|v| v.to_str().ok()).unwrap_or_default().to_string();
    let nom = entete("x-nom");
    if nom != "avatar" && nom != "banniere" {
        return Err(Erreur::Interne("média inconnu".into()));
    }
    let ext = match entete("x-type").as_str() {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "video/mp4" => "mp4",
        "video/webm" => "webm",
        _ => return Err(Erreur::Interne("format non pris en charge (PNG, JPG, GIF, WebP, MP4, WebM)".into())),
    };
    let tauri::ipc::InvokeBody::Raw(octets) = request.body() else {
        return Err(Erreur::Interne("fichier manquant".into()));
    };
    let cache = app.state::<crate::images_locales::CacheImages>();
    let dossier = cache.dossier_perso.clone();
    std::fs::create_dir_all(&dossier)?;
    // Un seul fichier par média : l'ancien (autre format) est retiré.
    for autre in ["png", "jpg", "gif", "webp", "mp4", "webm"] {
        let _ = std::fs::remove_file(dossier.join(format!("{nom}.{autre}")));
    }
    let fichier = format!("{nom}.{ext}");
    tokio::fs::write(dossier.join(&fichier), octets).await?;
    Ok(format!("http://img.localhost/__perso__/{fichier}?v={}", crate::cache::maintenant()))
}

// ——— Communauté : Workshop, captures, fil des amis ———

use crate::steam::workshop::{self, CapturesJeu, ModInstalle, ObjetWorkshop, PageWorkshop};

const TTL_OBJET_WORKSHOP: i64 = 24 * 3600;
const TTL_VITRINE_WORKSHOP: i64 = 3600;
const TTL_RECENTS_AMI: i64 = 15 * 60;

fn compte_connecte(app: &AppHandle) -> Resultat<(std::path::PathBuf, u32)> {
    let session = session_requise(app)?;
    let steam = local::dossier_steam().ok_or(Erreur::SteamIntrouvable)?;
    let compte = workshop::numero_compte(&session.steam_id).ok_or_else(|| Erreur::Interne("identifiant Steam invalide".into()))?;
    Ok((steam, compte))
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeWorkshop {
    pub app_id: u32,
    pub taille: u64,
    pub nombre: usize,
    pub maj_en_attente: usize,
    /// Identifiants des mods installés (pour marquer « Installé » dans la vitrine).
    pub ids: Vec<String>,
}

/// Jeux qui ont des mods installés (abonnements du compte connecté).
#[tauri::command]
pub async fn workshop_installe(app: AppHandle) -> Resultat<Vec<ResumeWorkshop>> {
    let (steam, compte) = compte_connecte(&app)?;
    let jeux = tokio::task::spawn_blocking(move || workshop::mods_installes(&steam, compte))
        .await
        .map_err(|_| Erreur::Interne("lecture du Workshop".into()))?;
    Ok(jeux
        .into_iter()
        .map(|j| ResumeWorkshop {
            app_id: j.app_id,
            taille: j.taille,
            nombre: j.mods.len(),
            maj_en_attente: j.mods.iter().filter(|m| m.a_mettre_a_jour).count(),
            ids: j.mods.iter().map(|m| m.id.clone()).collect(),
        })
        .collect())
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModDetaille {
    #[serde(flatten)]
    pub installe: ModInstalle,
    /// `None` si Steam ne donne plus de détails (mod retiré ou privé).
    pub objet: Option<ObjetWorkshop>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModsJeu {
    pub total: usize,
    pub taille: u64,
    pub mods: Vec<ModDetaille>,
}

/// Détails d'objets du Workshop, avec un cache d'un jour par objet.
async fn objets_caches(etat: &EtatApp, ids: &[String]) -> Resultat<HashMap<String, ObjetWorkshop>> {
    let mut connus = HashMap::new();
    let mut manquants = Vec::new();
    for id in ids {
        match etat.cache.frais::<ObjetWorkshop>(&format!("ugc:{id}"))? {
            Some(o) => {
                connus.insert(id.clone(), o);
            }
            None => manquants.push(id.clone()),
        }
    }
    if !manquants.is_empty() {
        for o in workshop::details(&etat.steam, &manquants).await? {
            etat.cache.ranger(&format!("ugc:{}", o.id), &o, TTL_OBJET_WORKSHOP)?;
            connus.insert(o.id.clone(), o);
        }
    }
    Ok(connus)
}

/// Mods installés d'un jeu, 40 par page, avec leurs détails.
#[tauri::command]
pub async fn mods_jeu(app: AppHandle, etat: State<'_, EtatApp>, app_id: u32, page: u32) -> Resultat<ModsJeu> {
    let (steam, compte) = compte_connecte(&app)?;
    let jeux = tokio::task::spawn_blocking(move || workshop::mods_installes(&steam, compte))
        .await
        .map_err(|_| Erreur::Interne("lecture du Workshop".into()))?;
    let Some(jeu) = jeux.into_iter().find(|j| j.app_id == app_id) else {
        return Ok(ModsJeu { total: 0, taille: 0, mods: vec![] });
    };
    let debut = (page as usize).saturating_mul(40).min(jeu.mods.len());
    let tranche: Vec<ModInstalle> = jeu.mods[debut..(debut + 40).min(jeu.mods.len())].to_vec();
    let ids: Vec<String> = tranche.iter().map(|m| m.id.clone()).collect();
    let mut objets = objets_caches(&etat, &ids).await.unwrap_or_default();
    Ok(ModsJeu {
        total: jeu.mods.len(),
        taille: jeu.taille,
        mods: tranche.into_iter().map(|m| ModDetaille { objet: objets.remove(&m.id), installe: m }).collect(),
    })
}

/// Vitrine du Workshop d'un jeu : tri, type de contenu, recherche, page.
#[tauri::command]
pub async fn vitrine_workshop(
    app: AppHandle,
    etat: State<'_, EtatApp>,
    app_id: u32,
    tri: String,
    genre: String,
    recherche: String,
    page: u32,
) -> Resultat<Donnee<PageWorkshop>> {
    let (_, cle) = identifiants(&app)?;
    let tri = if matches!(tri.as_str(), "populaires" | "recents" | "tendance" | "abonnes") { tri } else { "populaires".into() };
    let genre = if matches!(genre.as_str(), "objets" | "illustrations" | "captures" | "videos" | "guides") { genre } else { "objets".into() };
    let recherche: String = recherche.trim().chars().take(80).collect();
    let page = page.clamp(1, 200);
    let cle_cache = format!("vitrine-ws:{app_id}:{tri}:{genre}:{page}:{}", recherche.to_lowercase());
    etat.cache
        .avec_cache(&cle_cache, TTL_VITRINE_WORKSHOP, || workshop::vitrine(&etat.steam, &cle, app_id, &tri, &genre, &recherche, page))
        .await
}

/// Mes captures d'écran Steam, groupées par jeu (la plus récente d'abord).
#[tauri::command]
pub async fn mes_captures(app: AppHandle) -> Resultat<Vec<CapturesJeu>> {
    let (steam, compte) = compte_connecte(&app)?;
    if let Ok(mut d) = app.state::<crate::images_locales::CacheImages>().dossier_captures.write() {
        *d = Some(workshop::dossier_captures(&steam, compte));
    }
    tokio::task::spawn_blocking(move || workshop::captures(&steam, compte))
        .await
        .map_err(|_| Erreur::Interne("lecture des captures".into()))
}

/// Ouvre le dossier des captures d'un jeu dans l'Explorateur.
#[tauri::command]
pub async fn ouvrir_captures(app: AppHandle, app_id: u32) -> Resultat<()> {
    let (steam, compte) = compte_connecte(&app)?;
    let dossier = workshop::dossier_captures(&steam, compte).join(app_id.to_string()).join("screenshots");
    if !dossier.is_dir() {
        return Err(Erreur::Interne("dossier des captures introuvable".into()));
    }
    app.opener()
        .open_path(dossier.to_string_lossy(), None::<&str>)
        .map_err(|e| Erreur::Interne(format!("ouverture du dossier : {e}")))
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiviteAmi {
    pub joueur: Joueur,
    /// Jeux des deux dernières semaines (vide si privé).
    pub recents: Vec<JeuPossede>,
}

/// Fil de la Communauté : ce que font les amis (en jeu, jeux récents).
/// Les jeux récents de chaque ami sont gardés 15 minutes.
#[tauri::command]
pub async fn fil_amis(app: AppHandle, etat: State<'_, EtatApp>) -> Resultat<Vec<ActiviteAmi>> {
    let (sid, cle) = identifiants(&app)?;
    let amis = etat.cache.avec_cache(&format!("amis:{sid}"), TTL_AMIS, || etat.steam.amis(&cle, &sid)).await?.donnees;
    // Les plus actifs d'abord : en jeu, en ligne, puis dernière connexion.
    let mut joueurs: Vec<Joueur> = amis.amis.into_iter().map(|a| a.joueur).collect();
    joueurs.sort_by_key(|j| (j.jeu_en_cours.is_none(), j.etat == 0, -j.derniere_deconnexion.unwrap_or(0)));
    joueurs.truncate(60);
    let mut recents: HashMap<String, Vec<JeuPossede>> = HashMap::new();
    let mut a_lire = Vec::new();
    for j in &joueurs {
        match etat.cache.frais::<Vec<JeuPossede>>(&format!("recents:{}", j.steam_id))? {
            Some(r) => {
                recents.insert(j.steam_id.clone(), r);
            }
            None => a_lire.push(j.steam_id.clone()),
        }
    }
    for paquet in a_lire.chunks(8) {
        let mut taches = Vec::new();
        for id in paquet {
            let client = ClientSteam { http: etat.steam.http.clone() };
            let (cle, id) = (cle.clone(), id.clone());
            taches.push(tauri::async_runtime::spawn(async move {
                let r = client.jeux_recents(&cle, &id).await.unwrap_or_default();
                (id, r)
            }));
        }
        for t in taches {
            if let Ok((id, r)) = t.await {
                etat.cache.ranger(&format!("recents:{id}"), &r, TTL_RECENTS_AMI)?;
                recents.insert(id, r);
            }
        }
    }
    Ok(joueurs
        .into_iter()
        .map(|j| {
            let r = recents.remove(&j.steam_id).unwrap_or_default();
            ActiviteAmi { joueur: j, recents: r }
        })
        .collect())
}

/// Ouvre la page d'un objet du Workshop : dans Steam (pour s'abonner, connecté)
/// ou dans le navigateur. L'adresse est construite ici à partir de l'identifiant.
#[tauri::command]
pub fn ouvrir_objet_workshop(app: AppHandle, id: String, dans_steam: bool) -> Resultat<()> {
    if id.is_empty() || id.len() > 20 || !id.bytes().all(|b| b.is_ascii_digit()) {
        return Err(Erreur::Interne("objet du Workshop invalide".into()));
    }
    let page = format!("https://steamcommunity.com/sharedfiles/filedetails/?id={id}");
    let lien = if dans_steam { format!("steam://openurl/{page}") } else { page };
    app.opener().open_url(lien, None::<&str>).map_err(|_| Erreur::Interne("impossible d'ouvrir la page".into()))
}

// ——— Workshop : fiche complète, installation depuis ResTeaM ———

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FicheMod {
    pub objet: Option<ObjetWorkshop>,
    /// Vidéo ou image sur le disque, si l'objet est installé.
    pub local: Option<workshop::MediaLocal>,
}

/// Fiche d'un objet : galerie en grande taille, vidéos, description longue, et la
/// vidéo locale en pleine qualité si c'est un fond installé.
#[tauri::command]
pub async fn fiche_mod(app: AppHandle, etat: State<'_, EtatApp>, app_id: u32, id: String) -> Resultat<FicheMod> {
    if id.is_empty() || id.len() > 20 || !id.bytes().all(|b| b.is_ascii_digit()) {
        return Err(Erreur::Interne("objet du Workshop invalide".into()));
    }
    let (_, cle) = identifiants(&app)?;
    let objet = etat
        .cache
        .avec_cache(&format!("ugc-fiche:{id}"), TTL_OBJET_WORKSHOP, || workshop::fiche(&etat.steam, &cle, &id))
        .await
        .map(|d| d.donnees)
        .unwrap_or(None);
    let local = match local::dossier_steam() {
        Some(steam) => {
            if let Ok(mut d) = app.state::<crate::images_locales::CacheImages>().dossiers_workshop.write() {
                *d = workshop::dossiers_contenu(&steam);
            }
            let id2 = id.clone();
            tokio::task::spawn_blocking(move || workshop::media_local(&steam, app_id, &id2)).await.ok().flatten()
        }
        None => None,
    };
    Ok(FicheMod { objet, local })
}

/// Une seule demande à Steam à la fois.
static VERROU_AIDE: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// S'abonne (installer) ou se désabonne (retirer) d'un objet du Workshop par l'aide
/// `resteam-workshop.exe` (API Steamworks). Steam télécharge ou retire ensuite
/// l'objet en arrière-plan.
#[tauri::command]
pub async fn abonner_mod(app: AppHandle, app_id: u32, id: String, abonner: bool) -> Resultat<()> {
    if id.is_empty() || id.len() > 20 || !id.bytes().all(|b| b.is_ascii_digit()) {
        return Err(Erreur::Interne("objet du Workshop invalide".into()));
    }
    session_requise(&app)?;
    let aide = std::env::current_exe()
        .ok()
        .and_then(|e| e.parent().map(|p| p.join("resteam-workshop.exe")))
        .filter(|p| p.is_file())
        .ok_or_else(|| Erreur::Interne("aide Workshop introuvable (resteam-workshop.exe à côté de ResTeaM.exe)".into()))?;
    let _verrou = VERROU_AIDE.lock().await;
    let action = if abonner { "abonner" } else { "desabonner" };
    let sortie = tokio::task::spawn_blocking(move || {
        let mut cmd = std::process::Command::new(aide);
        cmd.args([action, &app_id.to_string(), &id]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }
        cmd.output()
    })
    .await
    .map_err(|_| Erreur::Interne("aide Workshop".into()))?
    .map_err(|e| Erreur::Interne(format!("aide Workshop : {e}")))?;
    let texte = String::from_utf8_lossy(&sortie.stdout);
    match texte.lines().map(str::trim).rev().find(|l| l.starts_with("OK") || l.starts_with("ERREUR")) {
        Some("OK") => Ok(()),
        Some(l) => Err(Erreur::Steam(l.trim_start_matches("ERREUR").trim().to_string())),
        None => Err(Erreur::Steam("pas de réponse de l'aide Workshop".into())),
    }
}

/// Où en est l'installation d'un objet : installé, ou octets reçus par Steam.
#[tauri::command]
pub async fn etat_mod(app: AppHandle, app_id: u32, id: String) -> Resultat<workshop::EtatMod> {
    if !id.bytes().all(|b| b.is_ascii_digit()) {
        return Err(Erreur::Interne("objet du Workshop invalide".into()));
    }
    let (steam, compte) = compte_connecte(&app)?;
    tokio::task::spawn_blocking(move || workshop::etat_mod(&steam, compte, app_id, &id))
        .await
        .map_err(|_| Erreur::Interne("lecture du Workshop".into()))
}

/// Ouvre une vidéo YouTube de présentation dans le navigateur.
#[tauri::command]
pub fn ouvrir_youtube(app: AppHandle, id: String) -> Resultat<()> {
    if id.is_empty() || id.len() > 20 || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
        return Err(Erreur::Interne("vidéo invalide".into()));
    }
    app.opener()
        .open_url(format!("https://www.youtube.com/watch?v={id}"), None::<&str>)
        .map_err(|_| Erreur::Interne("impossible d'ouvrir la vidéo".into()))
}

// ——— Salon d'achat (pages officielles de Steam dans une fenêtre ResTeaM) ———

/// Ouvre le salon d'achat : la fiche d'un jeu, ou une page de Steam vérifiée.
/// Commande `async` : sous Windows, une fenêtre et ses webviews doivent être
/// créées hors du fil principal, sinon WebView2 se bloque (fenêtre grise et vide).
#[tauri::command]
pub async fn ouvrir_salon(app: AppHandle, app_id: Option<u32>, adresse: Option<String>) -> Resultat<()> {
    let url = match (app_id, adresse) {
        (Some(id), _) => tauri::Url::parse(&format!("https://store.steampowered.com/app/{id}/")).ok(),
        (None, Some(a)) => crate::salon::adresse_depart(&a),
        (None, None) => tauri::Url::parse(crate::salon::ACCUEIL).ok(),
    }
    .ok_or_else(|| Erreur::Interne("adresse refusée : seules les pages de Steam s'ouvrent dans le salon".into()))?;
    crate::salon::ouvrir(&app, url).map_err(|e| Erreur::Interne(format!("salon d'achat : {e}")))
}

/// Dernier état du salon (adresse réelle, domaine, chargement), pour la barre.
#[tauri::command]
pub fn salon_etat() -> Option<crate::salon::EtatSalon> {
    crate::salon::etat()
}

/// Boutons de la barre du salon (retour, recharger, panier, fenêtre…).
/// `async` aussi : fermer la fenêtre depuis sa propre barre ne doit pas se faire
/// pendant que le fil principal traite la commande de cette barre.
#[tauri::command]
pub async fn salon_action(app: AppHandle, action: String) -> Resultat<()> {
    crate::salon::action(&app, &action).map_err(Erreur::Interne)
}
