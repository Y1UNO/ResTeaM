/** Chemins de l'app (routage par hash : fiable dans le WebView de Tauri). */
export const PATHS = {
  accueil: "/",
  bibliotheque: "/bibliotheque",
  magasin: "/magasin",
  classements: "/classements",
  souhaits: "/souhaits",
  recherche: "/recherche",
  telechargements: "/telechargements",
  profil: "/profil",
  jeu: "/jeu/:appId",
  parametres: "/parametres",
} as const;
