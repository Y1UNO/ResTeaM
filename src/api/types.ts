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
