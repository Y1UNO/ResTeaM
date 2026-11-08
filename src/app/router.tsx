import { createHashRouter, Navigate } from "react-router-dom";
import { Layout } from "./Layout";
import { PATHS } from "./paths";
import { Accueil } from "../pages/Accueil";
import { EmptyPage } from "../pages/EmptyPage";

export const router = createHashRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Accueil /> },
      { path: PATHS.bibliotheque, element: <EmptyPage title="Bibliothèque" step="4" /> },
      { path: PATHS.magasin, element: <EmptyPage title="Magasin" step="5" /> },
      { path: PATHS.jeu, element: <EmptyPage title="Fiche du jeu" step="5" /> },
      { path: PATHS.classements, element: <EmptyPage title="Classements" step="7" /> },
      { path: PATHS.souhaits, element: <EmptyPage title="Liste de souhaits" step="7" /> },
      { path: PATHS.recherche, element: <EmptyPage title="Recherche" step="8" /> },
      { path: PATHS.telechargements, element: <EmptyPage title="Téléchargements" step="8" /> },
      { path: PATHS.profil, element: <EmptyPage title="Profil" step="6" /> },
      { path: PATHS.parametres, element: <EmptyPage title="Paramètres" step="2a" /> },
      { path: "*", element: <Navigate to={PATHS.accueil} replace /> },
    ],
  },
]);
