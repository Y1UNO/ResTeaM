import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/commandes";
import { useNomJeu } from "../api/requetes";
import { estErreurApp } from "../api/types";
import { taille } from "../lib/format";
import { DefsLianes, LianeCote } from "./Lianes";
import "./installation.css";

const DUREE_SORTIE = 450;

type Props = {
  appId: number;
  nom: string;
  jaquette: string | null;
  /** Octets sur le disque. */
  poids: number;
  dossier: string;
  teinte: string;
  /** Jeu en cours (appid), si un jeu tourne : la suppression attendra. */
  jeuEnCours: number | null;
  onFermer: () => void;
};

/**
 * Confirmation de désinstallation, dans la DA de la fenêtre d'installation.
 * ResTeaM supprime lui-même les fichiers une fois Steam fermé, puis le relance caché.
 */
export function FenetreDesinstallation({ appId, nom, jaquette, poids, dossier, teinte, jeuEnCours, onFermer }: Props) {
  const client = useQueryClient();
  const [sortie, setSortie] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const minuterie = useRef<number | undefined>(undefined);
  const nomEnCours = useNomJeu(jeuEnCours);

  const fermer = () => {
    setSortie(true);
    window.clearTimeout(minuterie.current);
    minuterie.current = window.setTimeout(onFermer, DUREE_SORTIE);
  };
  useEffect(() => () => window.clearTimeout(minuterie.current), []);
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !envoi) fermer();
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  });

  const confirmer = () => {
    setEnvoi(true);
    setErreur(null);
    api
      .desinstallerJeu(appId)
      .then((f) => {
        client.setQueryData(["file-steam"], f);
        fermer();
      })
      .catch((e) => {
        setEnvoi(false);
        setErreur(estErreurApp(e) ? e.message : String(e));
      });
  };

  return createPortal(
    <div className="inst" style={{ "--inst-teinte": teinte } as CSSProperties}>
      <DefsLianes />
      <div className={`inst__voile ${sortie ? "is-sortie" : "is-entree"}`} onClick={() => !envoi && fermer()} aria-hidden="true" />
      <div className={`inst__bloc ${sortie ? "is-sortie" : "is-entree"}`} style={{ width: 520 }}>
        <LianeCote />
        <div role="alertdialog" aria-modal="true" aria-labelledby="desinst-titre" aria-describedby="desinst-texte" className="inst__panneau">
          <div className="inst__liseré" aria-hidden="true" />
          <div className="inst__entete">
            <div className="inst__jaquette" style={jaquette ? { backgroundImage: `url("${jaquette}")` } : undefined} />
            <div className="inst__titres">
              <span className="inst__statut">
                <span className="inst__point is-alerte" />
                Désinstaller
              </span>
              <h2 id="desinst-titre" className="inst__nom">
                {nom}
              </h2>
              <div className="inst__puces">
                <span>{poids > 0 ? `${taille(poids)} libérés` : "taille inconnue"}</span>
                <span>Sauvegardes cloud gardées</span>
              </div>
            </div>
          </div>

          <p id="desinst-texte" className="inst__texte">
            Les fichiers du jeu sont supprimés de <strong>{dossier || "son dossier"}</strong>, avec ses raccourcis. Tes heures
            de jeu, tes succès et tes sauvegardes Steam Cloud restent sur ton compte : tu pourras le réinstaller quand tu veux.
          </p>

          {jeuEnCours != null && (
            <p className="inst__info">
              <span className="inst__point" />
              {nomEnCours ?? "Un jeu"} est lancé : la suppression se fera dès que tu le quittes.
            </p>
          )}
          {erreur && <p className="message">{erreur}</p>}

          <p className="inst__note">
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flex: "0 0 auto", marginTop: 2 }}>
              <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
            </svg>
            Steam est fermé quelques secondes pendant la suppression, puis relancé caché.
          </p>

          <div className="inst__boutons">
            <button type="button" className="inst-btn" onClick={fermer} disabled={envoi}>
              Annuler
            </button>
            <button type="button" className="inst-btn inst-btn--danger" onClick={confirmer} disabled={envoi}>
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
              </svg>
              {envoi ? "Envoi…" : "Désinstaller"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
