import { createHashRouter, Navigate } from "react-router-dom";
import { Layout } from "./Layout";
import { Garde } from "./Garde";
import { PATHS } from "./paths";
import { Accueil } from "../pages/Accueil";
import { Parametres } from "../pages/Parametres";
import { Journal } from "../pages/journal/Journal";
import { Collection } from "../pages/collection/Collection";
import { Bibliotheque } from "../pages/Bibliotheque";
import { Fiche } from "../pages/fiche/Fiche";
import { Magasin } from "../pages/Magasin";
import { Profil } from "../pages/profil/Profil";
import { Souhaits } from "../pages/Souhaits";
import { Classements } from "../pages/Classements";
import { Communaute } from "../pages/communaute/Communaute";
import { Telechargements } from "../pages/Telechargements";
import { Amis } from "../pages/Amis";
import { Recherche } from "../pages/Recherche";
import { Connexion } from "../ecrans/Connexion";
import { CleApi } from "../ecrans/CleApi";
import { Chargement } from "../ecrans/Chargement";
import { useSession } from "./session";

/** Écrans plein cadre : attendent la fin de la lecture de la session. */
function AvantApp({ ecran }: { ecran: "connexion" | "cle" }) {
  const statut = useSession((s) => s.statut);
  if (statut === "chargement") return <Chargement />;
  return ecran === "connexion" ? <Connexion /> : <CleApi />;
}

export const router = createHashRouter([
  { path: PATHS.connexion, element: <AvantApp ecran="connexion" /> },
  { path: PATHS.cleApi, element: <AvantApp ecran="cle" /> },
  {
    path: "/",
    element: (
      <Garde>
        <Layout />
      </Garde>
    ),
    children: [
      { index: true, element: <Accueil /> },
      { path: PATHS.bibliotheque, element: <Bibliotheque /> },
      { path: PATHS.magasin, element: <Magasin /> },
      { path: PATHS.jeu, element: <Fiche /> },
      { path: PATHS.classements, element: <Classements /> },
      { path: PATHS.communaute, element: <Communaute /> },
      { path: PATHS.workshop, element: <Communaute /> },
      { path: PATHS.souhaits, element: <Souhaits /> },
      { path: PATHS.recherche, element: <Recherche /> },
      { path: PATHS.telechargements, element: <Telechargements /> },
      { path: PATHS.amis, element: <Amis /> },
      { path: PATHS.profil, element: <Profil /> },
      { path: PATHS.profilAmi, element: <Profil /> },
      { path: PATHS.parametres, element: <Parametres /> },
      { path: PATHS.journal, element: <Journal /> },
      { path: PATHS.collection, element: <Collection /> },
      { path: "*", element: <Navigate to={PATHS.accueil} replace /> },
    ],
  },
]);
