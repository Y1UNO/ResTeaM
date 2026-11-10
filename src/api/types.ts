/** Types renvoyés par les commandes Rust (`src-tauri/src/commandes.rs`). */

export type Session = { steamId: string };

export type Joueur = {
  steamId: string;
  pseudo: string;
  avatar: string;
  urlProfil: string;
  /** 0 hors ligne, 1 en ligne, 2 occupé, 3 absent, 4 en veille, 5 veut échanger, 6 veut jouer. */
  etat: number;
  /** 3 = profil public. */
  visibilite: number;
  nomReel: string | null;
  pays: string | null;
  jeuEnCours: string | null;
  jeuEnCoursId: string | null;
  /** Secondes depuis 1970. */
  derniereDeconnexion: number | null;
  /** Présents seulement si on peut rejoindre (rare). */
  lobby: string | null;
  serveur: string | null;
};

/** Donnée servie par le cache Rust. */
export type Donnee<T> = {
  donnees: T;
  /** Vrai si Steam n'a pas répondu et qu'on affiche la dernière valeur connue. */
  horsLigne: boolean;
  /** Secondes depuis 1970. */
  recupereLe: number;
};

export type CodeErreur =
  | "cle_absente"
  | "cle_refusee"
  | "cle_format"
  | "session_absente"
  | "prive"
  | "steam_introuvable"
  | "quota"
  | "reseau"
  | "steam"
  | "annule"
  | "delai"
  | "verification"
  | "interne";

export type ErreurApp = { code: CodeErreur; message: string };

export function estErreurApp(e: unknown): e is ErreurApp {
  return typeof e === "object" && e !== null && "code" in e && "message" in e;
}

// ——— Étape 2b ———

export type EtatInstallation = "installe" | "miseAJourRequise" | "telechargement" | "enPause" | "autre";

export type DossierBibliotheque = { chemin: string; nombreJeux: number };
export type InfosSteamLocal = { trouve: boolean; chemin: string | null; bibliotheques: DossierBibliotheque[] };

export type JeuInstalle = {
  appId: number;
  nom: string;
  dossier: string;
  bibliotheque: string;
  taille: number;
  etat: EtatInstallation;
  aTelecharger: number;
  telecharge: number;
  derniereMaj: number;
  dernierLancement: number;
};

export type Collection = { id: string; nom: string; jeux: number[]; dynamique: boolean };
export type Collections = { trouve: boolean; favoris: number[]; caches: number[]; liste: Collection[] };

export type JeuPossede = {
  appId: number;
  nom: string;
  minutesTotal: number;
  minutesDeuxSemaines: number;
  icone: string;
  dernierLancement: number;
};

export type Installation = {
  etat: EtatInstallation;
  taille: number;
  dossier: string;
  aTelecharger: number;
  telecharge: number;
};

export type JeuBibliotheque = JeuPossede & {
  installation: Installation | null;
  favori: boolean;
  cache: boolean;
  collections: string[];
};

export type ResumeCollection = { id: string; nom: string; nombre: number; dynamique: boolean };

export type Bibliotheque = {
  jeux: JeuBibliotheque[];
  collections: ResumeCollection[];
  nombreInstalles: number;
  nombreFavoris: number;
  steamLocal: boolean;
};

export type Badge = { id: number; appId: number | null; niveau: number; xp: number; obtenuLe: number; rarete: number };
export type NiveauBadges = {
  niveau: number;
  xp: number;
  xpNiveauActuel: number;
  xpPourSuivant: number;
  badges: Badge[];
};

export type Ami = Joueur & { amiDepuis: number };
/** Profil d'un autre joueur : les parties privées sont `null`. */
export type ProfilJoueur = { joueur: Joueur; niveau: NiveauBadges | null; jeux: JeuPossede[] | null; recents: JeuPossede[] | null };
export type ListeAmis = { prive: boolean; amis: Ami[] };

export type Succes = {
  id: string;
  nom: string;
  description: string | null;
  icone: string | null;
  iconeGrise: string | null;
  cache: boolean;
  debloque: boolean;
  debloqueLe: number | null;
};
export type SuccesJeu = { appId: number; total: number; debloques: number; succes: Succes[] };

export type Actu = {
  id: string;
  titre: string;
  url: string;
  auteur: string | null;
  contenu: string;
  date: number;
  source: string;
  officielle: boolean;
  patch: boolean;
};

// ——— Étape 3 ———

export type ImagesJeu = {
  jaquette: string | null;
  /** Jaquette 600×900, pour les tuiles de la bibliothèque. */
  jaquettePetite?: string | null;
  hero: string | null;
  banniere: string | null;
};

export type CategorieNotes = "nouveau" | "equilibrage" | "performances" | "correctifs" | "autre";
export type ElementNotes = { texte: string; sous: string[] };
export type SectionNotes = { categorie: CategorieNotes; elements: ElementNotes[] };
export type PatchNotes = {
  id: string;
  titre: string;
  url: string;
  date: number;
  version: string | null;
  patch: boolean;
  sections: SectionNotes[];
};

/** Actions `steam://` : le Rust construit et vérifie le lien. */
export type ActionSteam =
  | { type: "jouer"; appId: number }
  | { type: "installer"; appId: number }
  | { type: "magasin"; appId: number }
  | { type: "rejoindreLobby"; appId: number; lobby: string; steamId: string }
  | { type: "rejoindreServeur"; adresse: string }
  | { type: "amis" }
  | { type: "telechargements" }
  | { type: "verifier"; appId: number }
  | { type: "page"; url: string };

// ——— Installation sans la fenêtre de Steam ———

export type Disque = { bibliotheque: string; lecteur: string; nom: string; libre: number; total: number };
export type OptionsInstallation = {
  nom: string;
  tailleEstimee: number | null;
  disques: Disque[];
  jeuEnCours: number | null;
  dejaInstalle: boolean;
};
/** Installations et désinstallations qui attendent un redémarrage de Steam. */
export type FileSteam = {
  /** `attenteJeu` : un jeu tourne, on attend qu'il se ferme. */
  phase: "repos" | "attenteJeu" | "redemarrage";
  jeuEnCours: number | null;
  installations: number[];
  desinstallations: number[];
  reglages?: Reglage[];
  /** Paramètres de Steam en attente du prochain redémarrage. */
  reglageSteam?: ReglageSteam | null;
};

// ——— Préférences de ResTeaM et jeu en cours ———

export type Preferences = {
  fermerReduit: boolean;
  steamCache: boolean;
  reduireEnJeu: boolean;
  notifTelechargement: boolean;
  notifMaj: boolean;
  notifAmi: boolean;
  notifPromo: boolean;
  notifPasEnJeu: boolean;
  notifCoin: "bd" | "hd" | "bg" | "hg";
  notifDuree: number;
};
export type PreferencesEtat = { preferences: Preferences; demarrageWindows: boolean };
/** Carte de notification ResTeaM (fenêtre `notifs`). */
export type Notif = {
  id: number;
  genre: "ami" | "telechargement" | "maj" | "promo" | "resteam" | string;
  titre: string;
  texte: string;
  image: string | null;
  vignette: string | null;
  cadre: string | null;
  badge: string | null;
  jouer: number | null;
  page: string | null;
};
export type NotifsAPrendre = { notifs: Notif[]; duree: number; coin: "bd" | "hd" | "bg" | "hg" | string };
/** Millisecondes depuis 1970. */
export type SessionJeu = { appId: number; debut: number; fin: number | null };
export type EtatJeu = { enCours: SessionJeu | null; derniere: SessionJeu | null };

// ——— Partage du profil (serveur ResTeaM) ———

export type FichierPartage = { url: string; type: string; video: boolean };
export type ProfilPartage = {
  steamId: string;
  style: {
    fond?: "steam" | "banniere" | "avatar" | "nebuleuse" | "aurore" | "jeu";
    cadre?: "steam" | "aucun" | "lune" | "lianes" | "engrenages" | "aura";
    effet?: "pluie" | "lucioles" | "etoiles" | "aucun";
    accent?: string;
    avatarAnime?: boolean;
    jeuFond?: number | null;
  };
  avatar: FichierPartage | null;
  banniere: FichierPartage | null;
  maj: number;
};
/** Réponse de `/moi` : mon SteamID et mon profil partagé (nul avant le premier envoi). */
export type EtatPartage = { steamId: string; profil: ProfilPartage | null } | null;

// ——— Historique des notes de mise à jour ———

export type AnnonceJeu = PatchNotes & { image: string | null; extrait: string | null };
export type PageAnnonces = { annonces: AnnonceJeu[]; suivant: number | null };

// ——— Trophées du profil ———

export type TropheeRare = { appId: number; nom: string; icone: string; pourcentage: number };
export type DernierTrophee = { appId: number; nom: string; icone: string | null; date: number };
export type BilanTrophees = {
  total: number;
  jeux: number;
  /** Jeux terminés à 100 %. */
  complets: number[];
  plusRare: TropheeRare | null;
  dernier: DernierTrophee | null;
};

// ——— Paramètres de Steam ———

/** Changements demandés (seuls les champs non nuls sont écrits). */
export type ReglageSteam = {
  compte?: string;
  /** Limite de débit en kilobits par seconde (0 : sans limite). */
  limiteKbps: number | null;
  telechargementsEnJeu: boolean | null;
  ralentirStreaming: boolean | null;
  overlay: boolean | null;
};
export type BibliothequeSteam = { disque: Disque; nombreJeux: number };
export type ParametresSteam = {
  limiteKbps: number;
  telechargementsEnJeu: boolean;
  ralentirStreaming: boolean;
  overlay: boolean;
  demarrageWindows: boolean;
  bibliotheques: BibliothequeSteam[];
};
export type ParametresSteamEtat = { parametres: ParametresSteam; enAttente: ReglageSteam | null; file: FileSteam };

// ——— Étape 10 : propriétés d'un jeu ———

export type Reglage = {
  appId: number;
  compte?: string;
  optionsLancement: string | null;
  /** 0 : toujours à jour · 1 : au lancement · 2 : en priorité. */
  majAuto: number | null;
  /** 0 : réglage de Steam · 1 : toujours · 2 : jamais. */
  telechargementsEnJeu: number | null;
};
export type ProprietesJeu = {
  appId: number;
  installe: boolean;
  optionsLancement: string;
  majAuto: number;
  telechargementsEnJeu: number;
  langue: string | null;
  dossier: string | null;
  taille: number;
  version: string | null;
  derniereMaj: number;
  dlc: number[];
  enAttente: Reglage | null;
};
export type DemandeInstallation = {
  appId: number;
  nom: string;
  bibliotheque: string;
  raccourciBureau: boolean;
  raccourciMenu: boolean;
};
export type StatsSysteme = {
  horodatageMs: number;
  reseauRecu: number;
  steamEcrit: number | null;
  disques: { lecteur: string; libre: number }[];
};

// ——— Étape 5 : magasin ———

export type Prix = { initial: number; final_: number; reduction: number; texteInitial: string; texteFinal: string };
export type Media = { video: boolean; nom: string; miniature: string; url: string };
export type LigneConfig = { cle: string; valeur: string };
export type FicheJeu = {
  appId: number;
  nom: string;
  gratuit: boolean;
  resume: string;
  aPropos: string[];
  genres: string[];
  developpeurs: string[];
  editeurs: string[];
  sortie: string;
  aVenir: boolean;
  langues: string[];
  prix: Prix | null;
  demo: boolean;
  medias: Media[];
  configMinimale: LigneConfig[];
  configRecommandee: LigneConfig[];
  metacritic: number | null;
};
export type ResumeAvis = { libelle: string; pourcentage: number; nombre: number };
export type AvisJeu = { global: ResumeAvis | null; francais: ResumeAvis | null };
export type OffreMagasin = {
  appId: number;
  nom: string;
  reduction: number;
  prixInitial: number;
  prixFinal: number;
  devise: string;
  image: string | null;
  finOffre: number | null;
};
export type VitrineMagasin = {
  offres: OffreMagasin[];
  meilleuresVentes: OffreMagasin[];
  nouveautes: OffreMagasin[];
  aVenir?: OffreMagasin[];
};
export type ConfigPc = {
  systeme: string;
  memoire: number;
  processeur: string;
  coeurs: number;
  carteGraphique: string | null;
  memoireGraphique: number | null;
  espaceLibreMax: number;
};

// ——— Boutique complète ———

export type PrixProduit = { final_: number; initial: number; reduction: number; texteFinal: string; texteInitial: string; finPromo: number | null };
export type Produit = {
  appId: number;
  nom: string;
  banniere: string | null;
  capsule: string | null;
  jaquette: string | null;
  hero: string | null;
  prix: PrixProduit | null;
  gratuit: boolean;
  sortie: number | null;
  sortieTexte: string | null;
  aVenir: boolean;
  avis: ResumeAvis | null;
  tags: string[];
  captures: string[];
};
export type Souhait = { appId: number; priorite: number; ajouteLe: number };

// ——— Étape 7 : classements ———

export type Classe = { rang: number; appId: number; rangAvant: number; valeur: number };
export type Classements = { plusJoues: Classe[]; meilleuresVentes: Classe[] };
export type Releve = { le: number; joueurs: number };
export type EnLigne = { joueurs: number; releves: Releve[] };

// ——— Objets de profil Steam ———

export type ObjetProfil = { nom: string; image: string | null; videoWebm: string | null; videoMp4: string | null };
export type ObjetsProfil = { fond: ObjetProfil | null; miniFond: ObjetProfil | null; cadre: ObjetProfil | null; avatarAnime: ObjetProfil | null };

// ——— Communauté (Workshop, captures, fil des amis) ———

export type ResumeWorkshop = { appId: number; taille: number; nombre: number; majEnAttente: number; ids: string[] };

export type ObjetWorkshop = {
  id: string;
  appId: number;
  titre: string;
  apercu: string;
  description: string;
  taille: number;
  maj: number;
  abonnes: number;
  favoris: number;
  vues: number;
  /** Note de 0 à 1. */
  note: number | null;
  votes: number | null;
  tags: string[];
  /** Identifiant YouTube, pour les vidéos. */
  video: string | null;
  /** Images en grande taille ajoutées par l'auteur. */
  galerie?: string[];
  /** Vidéos YouTube de présentation. */
  youtube?: string[];
};

/** `imageHd` : illustration d'un fond « scène » tirée de `scene.pkg`, en pleine définition. */
export type MediaLocal = { video: string | null; image: string | null; imageHd?: string | null };
export type FicheMod = { objet: ObjetWorkshop | null; local: MediaLocal | null };
export type EtatMod = { installe: boolean; recu: number };

/** État du salon d'achat : adresse réelle affichée par la barre ResTeaM. */
export type EtatSalon = { url: string; hote: string; officiel: boolean; securise: boolean; titre: string; chargement: boolean };
export type ActionSalon = "retour" | "avancer" | "recharger" | "accueil" | "panier" | "navigateur" | "reduire" | "agrandir" | "fermer";

export type ModDetaille = {
  id: string;
  taille: number;
  maj: number;
  aMettreAJour: boolean;
  objet: ObjetWorkshop | null;
};

export type ModsJeu = { total: number; taille: number; mods: ModDetaille[] };
export type PageWorkshop = { total: number; objets: ObjetWorkshop[] };
export type TriWorkshop = "populaires" | "tendance" | "recents" | "abonnes";
export type GenreWorkshop = "objets" | "illustrations" | "captures" | "videos" | "guides";

export type Capture = { fichier: string; miniature: string; largeur: number; hauteur: number; date: number };
export type CapturesJeu = { appId: number; captures: Capture[] };

export type ActiviteAmi = { joueur: Joueur; recents: JeuPossede[] };
