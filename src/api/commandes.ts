import { invoke } from "@tauri-apps/api/core";
import {
  estErreurApp,
  type ActionSteam,
  type Actu,
  type Bibliotheque,
  type Collections,
  type AvisJeu,
  type Classements,
  type ConfigPc,
  type EnLigne,
  type DemandeInstallation,
  type FicheJeu,
  type Produit,
  type ObjetsProfil,
  type ProfilJoueur,
  type ProprietesJeu,
  type Reglage,
  type Souhait,
  type VitrineMagasin,
  type FileSteam,
  type Donnee,
  type ImagesJeu,
  type ErreurApp,
  type InfosSteamLocal,
  type JeuInstalle,
  type JeuPossede,
  type Joueur,
  type ListeAmis,
  type NiveauBadges,
  type OptionsInstallation,
  type PatchNotes,
  type Session,
  type StatsSysteme,
  type SuccesJeu,
  type ActiviteAmi,
  type EtatMod,
  type EtatSalon,
  type ActionSalon,
  type FicheMod,
  type CapturesJeu,
  type GenreWorkshop,
  type ModsJeu,
  type PageWorkshop,
  type ResumeWorkshop,
  type TriWorkshop,
  ParametresSteamEtat,
  ReglageSteam,
  Preferences,
  PreferencesEtat,
  EtatJeu,
  BilanTrophees,
  EtatPartage,
  ProfilPartage,
  NotifsAPrendre,
  SessionJeu,
  NoteJeu,
  PageAnnonces,
} from "./types";

/** Vrai dans l'exe (WebView de Tauri), faux dans un simple navigateur. */
export const dansTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function appeler<T>(commande: string, args?: Record<string, unknown>): Promise<T> {
  if (!dansTauri) {
    // Aperçu dans un navigateur (vérification visuelle) : faux back-end en mémoire.
    const { apercu } = await import("./apercu");
    return apercu<T>(commande, args);
  }
  try {
    return await invoke<T>(commande, args);
  } catch (e) {
    if (estErreurApp(e)) throw e;
    const inconnue: ErreurApp = { code: "interne", message: String(e) };
    throw inconnue;
  }
}

/** Appels typés vers le Rust. La clé API n'est jamais lue : on sait seulement si elle existe. */
export const api = {
  sessionLire: () => appeler<Session | null>("session_lire"),
  connexionSteam: () => appeler<Session>("connexion_steam"),
  connexionAnnuler: () => appeler<void>("connexion_annuler"),
  deconnexion: () => appeler<void>("deconnexion"),
  cleEtat: () => appeler<boolean>("cle_etat"),
  cleEnregistrer: (cle: string) => appeler<void>("cle_enregistrer", { cle }),
  cleSupprimer: () => appeler<void>("cle_supprimer"),
  ouvrirPageCleApi: () => appeler<void>("ouvrir_page_cle_api"),
  joueurMoi: () => appeler<Donnee<Joueur>>("joueur_moi"),

  // Lecture locale (sans réseau)
  steamLocal: () => appeler<InfosSteamLocal>("steam_local"),
  jeuxInstalles: () => appeler<JeuInstalle[]>("jeux_installes"),
  collections: () => appeler<Collections>("collections"),

  // Données du compte (Web API, avec cache Rust)
  bibliotheque: () => appeler<Donnee<Bibliotheque>>("bibliotheque"),
  recemmentJoues: () => appeler<Donnee<JeuPossede[]>>("recemment_joues"),
  niveauBadges: () => appeler<Donnee<NiveauBadges>>("niveau_badges"),
  amis: () => appeler<Donnee<ListeAmis>>("amis"),
  succesJeu: (appId: number) => appeler<Donnee<SuccesJeu | null>>("succes_jeu", { appId }),
  actusJeu: (appId: number) => appeler<Donnee<Actu[]>>("actus_jeu", { appId }),

  // Accueil
  imagesJeux: (appIds: number[]) => appeler<Record<string, ImagesJeu>>("images_jeux", { appIds }),
  patchNotes: (appId: number) => appeler<Donnee<PatchNotes | null>>("patch_notes", { appId }),
  steamLien: (action: ActionSteam) => appeler<void>("steam_lien", { action }),

  // Installation sans la fenêtre de Steam
  optionsInstallation: (appId: number, nom: string) =>
    appeler<OptionsInstallation>("options_installation", { appId, nom }),
  installerJeu: (d: DemandeInstallation) => appeler<FileSteam>("installer_jeu", d),
  desinstallerJeu: (appId: number) => appeler<FileSteam>("desinstaller_jeu", { appId }),
  fileSteam: () => appeler<FileSteam>("file_steam"),
  annulerFileSteam: (appId: number) => appeler<FileSteam>("annuler_file_steam", { appId }),
  ficheJeu: (appId: number) => appeler<Donnee<FicheJeu>>("fiche_jeu", { appId }),
  avisJeu: (appId: number) => appeler<Donnee<AvisJeu>>("avis_jeu", { appId }),
  vitrineMagasin: () => appeler<Donnee<VitrineMagasin>>("vitrine_magasin"),
  configPc: () => appeler<ConfigPc>("config_pc"),
  produitsMagasin: (appIds: number[]) => appeler<Produit[]>("produits_magasin", { appIds }),
  rechercheMagasin: (terme: string) => appeler<Produit[]>("recherche_magasin", { terme }),
  rayonMagasin: (rayon: string) => appeler<Produit[]>("rayon_magasin", { rayon }),
  listeSouhaits: () => appeler<Donnee<Souhait[]>>("liste_souhaits"),
  classements: () => appeler<Donnee<Classements>>("classements"),
  enLigne: () => appeler<Donnee<EnLigne>>("en_ligne"),
  amisPossedant: (appId: number) => appeler<string[]>("amis_possedant", { appId }),
  profilJoueur: (steamId: string) => appeler<Donnee<ProfilJoueur>>("profil_joueur", { steamId }),
  proprietesJeu: (appId: number) => appeler<ProprietesJeu>("proprietes_jeu", { appId }),
  reglerJeu: (demande: Omit<Reglage, "compte">) => appeler<FileSteam>("regler_jeu", { demande }),
  preferencesLire: () => appeler<PreferencesEtat>("preferences_lire"),
  preferencesEcrire: (preferences: Preferences) => appeler<void>("preferences_ecrire", { preferences }),
  resteamAuDemarrage: (actif: boolean) => appeler<boolean>("resteam_au_demarrage", { actif }),
  jeuSession: () => appeler<EtatJeu>("jeu_session"),
  historiqueNotes: (appId: number, avant: number | null) => appeler<PageAnnonces>("historique_notes", { appId, avant }),
  journalSessions: (depuis: number, jusqu: number) => appeler<SessionJeu[]>("journal_sessions", { depuis, jusqu }),
  noteJeu: (appId: number) => appeler<NoteJeu | null>("note_jeu", { appId }),
  noteJeuEcrire: (appId: number, texte: string) => appeler<NoteJeu | null>("note_jeu_ecrire", { appId, texte }),
  partageEtat: () => appeler<EtatPartage>("partage_etat"),
  partageConnecter: () => appeler<EtatPartage>("partage_connecter"),
  partagePublier: (style: object) => appeler<unknown>("partage_publier", { style }),
  partageFichier: (nom: "avatar" | "banniere") => appeler<unknown>("partage_fichier", { nom }),
  partageRetirerFichier: (nom: "avatar" | "banniere") => appeler<void>("partage_retirer_fichier", { nom }),
  partageArreter: () => appeler<void>("partage_arreter"),
  profilPartage: (steamId: string) => appeler<ProfilPartage | null>("profil_partage", { steamId }),
  bilanTrophees: (steamId: string | null) => appeler<Donnee<BilanTrophees>>("bilan_trophees", { steamId }),
  notificationEssai: () => appeler<void>("notification_essai"),
  notifsPrendre: () => appeler<NotifsAPrendre>("notifs_prendre"),
  notifsTaille: (hauteur: number) => appeler<void>("notifs_taille", { hauteur }),
  notifsClic: (page: string | null, jouer: number | null) => appeler<void>("notifs_clic", { page, jouer }),
  parametresSteam: () => appeler<ParametresSteamEtat>("parametres_steam"),
  reglerSteam: (demande: Omit<ReglageSteam, "compte">) => appeler<FileSteam>("regler_steam", { demande }),
  annulerReglageSteam: () => appeler<FileSteam>("annuler_reglage_steam"),
  steamAuDemarrage: (actif: boolean) => appeler<boolean>("steam_au_demarrage", { actif }),
  ouvrirBibliothequeSteam: (chemin: string) => appeler<void>("ouvrir_bibliotheque_steam", { chemin }),
  ouvrirDossierJeu: (appId: number) => appeler<void>("ouvrir_dossier_jeu", { appId }),
  dlcJeu: (appId: number) => appeler<Produit[]>("dlc_jeu", { appId }),
  objetsProfil: (steamId: string) => appeler<Donnee<ObjetsProfil>>("objets_profil", { steamId }),
  statsSysteme: () => appeler<StatsSysteme>("stats_systeme"),
  workshopInstalle: () => appeler<ResumeWorkshop[]>("workshop_installe"),
  modsJeu: (appId: number, page: number) => appeler<ModsJeu>("mods_jeu", { appId, page }),
  vitrineWorkshop: (appId: number, tri: TriWorkshop, genre: GenreWorkshop, recherche: string, page: number) =>
    appeler<Donnee<PageWorkshop>>("vitrine_workshop", { appId, tri, genre, recherche, page }),
  mesCaptures: () => appeler<CapturesJeu[]>("mes_captures"),
  ouvrirCaptures: (appId: number) => appeler<void>("ouvrir_captures", { appId }),
  filAmis: () => appeler<ActiviteAmi[]>("fil_amis"),
  ouvrirObjetWorkshop: (id: string, dansSteam: boolean) => appeler<void>("ouvrir_objet_workshop", { id, dansSteam }),
  ficheMod: (appId: number, id: string) => appeler<FicheMod>("fiche_mod", { appId, id }),
  abonnerMod: (appId: number, id: string, abonner: boolean) => appeler<void>("abonner_mod", { appId, id, abonner }),
  etatMod: (appId: number, id: string) => appeler<EtatMod>("etat_mod", { appId, id }),
  ouvrirYoutube: (id: string) => appeler<void>("ouvrir_youtube", { id }),
  ouvrirSalon: (appId: number | null, adresse: string | null = null) => appeler<void>("ouvrir_salon", { appId, adresse }),
  salonEtat: () => appeler<EtatSalon | null>("salon_etat"),
  salonAction: (action: ActionSalon) => appeler<void>("salon_action", { action }),
};

/** Adresse d'une capture d'écran locale de Steam (servie par le protocole `img`). */
export function adresseCapture(fichier: string): string {
  return fichier.startsWith("https://") ? fichier : `http://img.localhost/__captures__/${fichier}`;
}

/**
 * Avatar ou bannière choisis sur le PC (image, GIF ou vidéo), envoyés en binaire brut
 * au Rust qui les range dans le dossier de ResTeaM. Renvoie l'adresse à afficher.
 * Dans l'aperçu navigateur, une adresse locale temporaire.
 */
export async function enregistrerMediaPerso(nom: "avatar" | "banniere", fichier: File): Promise<string> {
  if (!dansTauri) return URL.createObjectURL(fichier);
  const octets = new Uint8Array(await fichier.arrayBuffer());
  return invoke<string>("enregistrer_media_perso", octets, { headers: { "x-nom": nom, "x-type": fichier.type } });
}
