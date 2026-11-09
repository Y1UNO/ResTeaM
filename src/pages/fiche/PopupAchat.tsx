import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api/commandes";
import { IconePanier } from "../../components/Prix";
import "./fiche.css";

// ——— Popup d'achat (paiement dans Steam) ———

type Props = { appId: number; nom: string; prix: string; obtenir?: boolean; onFermer: () => void };

/** Popup de sécurité de la maquette 02 : l'achat se fait toujours dans Steam. */
export function PopupAchat({ appId, nom, prix, obtenir = false, onFermer }: Props) {
  const [sortie, setSortie] = useState(false);
  const minuterie = useRef<number | undefined>(undefined);
  const fermer = useMemo(
    () => () => {
      setSortie(true);
      window.clearTimeout(minuterie.current);
      minuterie.current = window.setTimeout(onFermer, 380);
    },
    [onFermer],
  );
  useEffect(() => () => window.clearTimeout(minuterie.current), []);
  useEffect(() => {
    const touche = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [fermer]);

  const salon = () => {
    void api.ouvrirSalon(appId);
    fermer();
  };
  const client = () => {
    void api.steamLien({ type: "magasin", appId });
    fermer();
  };

  return createPortal(
    <>
      <div className={`achat__voile ${sortie ? "is-sortie" : ""}`} onClick={fermer} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="achat-titre" className={`achat ${sortie ? "is-sortie" : ""}`}>
        <div className="achat__icone" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </div>
        <h2 id="achat-titre" className="achat__titre">
          {obtenir ? "Obtenir" : "Acheter"} {nom}
        </h2>
        <p className="achat__texte">
          Le paiement se fait chez Steam, sur ses pages officielles, ouvertes dans le salon d’achat de ResTeaM. Steam gère la
          connexion et le paiement : ResTeaM n’y a jamais accès.
        </p>
        <div className="achat__prix">
          <span>Prix</span>
          <strong>{prix}</strong>
        </div>
        <div className="achat__boutons achat__boutons--choix">
          <button type="button" className="btn btn--secondaire btn--petit" onClick={client}>
            Dans le client Steam
          </button>
          <button type="button" className="btn btn--principal btn--petit achat__ouvrir" onClick={salon} autoFocus>
            <IconePanier />
            Ouvrir le salon d’achat
          </button>
        </div>
        <button type="button" className="btn btn--lien achat__annuler" onClick={fermer}>
          Annuler
        </button>
      </div>
    </>,
    document.body,
  );
}
