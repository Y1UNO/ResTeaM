import { createHashRouter, Navigate } from "react-router-dom";
import { Layout } from "./Layout";
import { Garde } from "./Garde";
import { PATHS } from "./paths";
import { Accueil } from "../pages/Accueil";
import { EmptyPage } from "../pages/EmptyPage";
import { Parametres } from "../pages/Parametres";
import { DonneesTest } from "../pages/DonneesTest";
import { Bibliotheque } from "../pages/Bibliotheque";
import { Fiche } from "../pages/fiche/Fiche";
import { Magasin } from "../pages/Magasin";
import { Profil } from "../pages/profil/Profil";
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
      { path: PATHS.classements, element: <EmptyPage title="Classements" step="7" /> },
      { path: PATHS.souhaits, element: <EmptyPage title="Liste de souhaits" step="7" /> },
      { path: PATHS.recherche, element: <EmptyPage title="Recherche" step="8" /> },
      { path: PATHS.telechargements, element: <EmptyPage title="Téléchargements" step="8" /> },
      { path: PATHS.profil, element: <Profil /> },
      { path: PATHS.parametres, element: <Parametres /> },
      { path: PATHS.donnees, element: <DonneesTest /> },
      { path: "*", element: <Navigate to={PATHS.accueil} replace /> },
    ],
  },
]);
