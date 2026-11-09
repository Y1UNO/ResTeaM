/** Chemins de l'app (routage par hash : fiable dans le WebView de Tauri). */
export const PATHS = {
  accueil: "/",
  bibliotheque: "/bibliotheque",
  magasin: "/magasin",
  classements: "/classements",
  souhaits: "/souhaits",
  recherche: "/recherche",
  telechargements: "/telechargements",
  amis: "/amis",
  profil: "/profil",
  jeu: "/jeu/:appId",
  parametres: "/parametres",
  connexion: "/connexion",
  cleApi: "/cle-api",
  donnees: "/donnees",
} as const;
