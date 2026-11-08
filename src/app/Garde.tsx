import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Chargement } from "../ecrans/Chargement";
import { useSession } from "./session";
import { PATHS } from "./paths";

/** Laisse entrer dans l'app seulement si on est connecté et qu'une clé API est enregistrée. */
export function Garde({ children }: { children: ReactNode }) {
  const statut = useSession((s) => s.statut);
  if (statut === "chargement") return <Chargement />;
  if (statut === "deconnecte") return <Navigate to={PATHS.connexion} replace />;
  if (statut === "sans-cle") return <Navigate to={PATHS.cleApi} replace />;
  return <>{children}</>;
}
