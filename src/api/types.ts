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

export type ImagesJeu = { jaquette: string | null; hero: string | null; banniere: string | null };

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
  | { type: "page"; url: string };
