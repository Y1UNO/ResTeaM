/** Chemins de l'app (routage par hash : fiable dans le WebView de Tauri). */
export const PATHS = {
  accueil: "/",
  bibliotheque: "/bibliotheque",
  magasin: "/magasin",
  classements: "/classements",
  communaute: "/communaute",
  souhaits: "/souhaits",
  recherche: "/recherche",
  telechargements: "/telechargements",
  amis: "/amis",
  profil: "/profil",
  profilAmi: "/profil/:steamId",
  jeu: "/jeu/:appId",
  parametres: "/parametres",
  connexion: "/connexion",
  cleApi: "/cle-api",
} as const;
