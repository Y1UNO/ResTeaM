import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import "../pages/secondaires.css";

/**
 * Indicateur hors ligne (étape 8) : sans Internet, l'app affiche ce qu'elle a en
 * cache. Au retour du réseau, toutes les données sont relues.
 */
export function HorsLigne() {
  const client = useQueryClient();
  const [enLigne, setEnLigne] = useState(() => navigator.onLine);
  useEffect(() => {
    const haut = () => {
      setEnLigne(true);
      void client.invalidateQueries();
    };
    const bas = () => setEnLigne(false);
    window.addEventListener("online", haut);
    window.addEventListener("offline", bas);
    return () => {
      window.removeEventListener("online", haut);
      window.removeEventListener("offline", bas);
    };
  }, [client]);
  if (enLigne) return null;
  return (
    <div className="hors-ligne" role="status">
      <span className="hors-ligne__point" />
      Hors ligne : tu vois les dernières données gardées. Tout se mettra à jour au retour d’Internet.
    </div>
  );
}
