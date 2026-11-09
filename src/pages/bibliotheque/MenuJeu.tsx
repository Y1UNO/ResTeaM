import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/commandes";
import { useFileSteam } from "../../api/requetes";
import type { JeuBibliotheque } from "../../api/types";
import { FenetreDesinstallation } from "../../installation/Desinstallation";
import { useInstallation } from "../../installation/store";
import { imagesDe } from "../../lib/images";
import type { ImagesJeu } from "../../api/types";
import { FenetreProprietes } from "../fiche/Proprietes";
import "./MenuJeu.css";

type Props = { jeu: JeuBibliotheque; x: number; y: number; images?: Record<string, ImagesJeu>; onFermer: () => void };

/**
 * Menu du clic droit sur un jeu (demande de Tom) : Jouer / Installer, Propriétés,
 * fiche, dossier, désinstaller. S'ouvre sous le curseur, se ferme au clic dehors.
 */
export function MenuJeu({ jeu, x, y, images, onFermer }: Props) {
  const navigate = useNavigate();
  const installation = useInstallation();
  const file = useFileSteam().data;
  const boite = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [fenetre, setFenetre] = useState<"proprietes" | "desinstaller" | null>(null);
  const im = imagesDe(jeu.appId, images);
  const inst = jeu.installation;
  const enCours = inst?.etat === "telechargement" || inst?.etat === "enPause";
  const suivi = { appId: jeu.appId, nom: jeu.nom, jaquette: im.jaquette, hero: im.hero };

  // Le menu reste dans la fenêtre.
  useLayoutEffect(() => {
    const r = boite.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: Math.min(x, window.innerWidth - r.width - 12), y: Math.min(y, window.innerHeight - r.height - 12) });
  }, [x, y]);

  useEffect(() => {
    if (fenetre) return;
    const dehors = (e: MouseEvent) => !boite.current?.contains(e.target as Node) && onFermer();
    const touche = (e: KeyboardEvent) => e.key === "Escape" && onFermer();
    window.addEventListener("mousedown", dehors);
    window.addEventListener("keydown", touche);
    window.addEventListener("scroll", onFermer, true);
    return () => {
      window.removeEventListener("mousedown", dehors);
      window.removeEventListener("keydown", touche);
      window.removeEventListener("scroll", onFermer, true);
    };
  }, [fenetre, onFermer]);

  if (fenetre === "proprietes") return <FenetreProprietes appId={jeu.appId} nom={jeu.nom} jaquette={im.jaquette} onFermer={onFermer} />;
  if (fenetre === "desinstaller" && inst)
    return (
      <FenetreDesinstallation
        appId={jeu.appId}
        nom={jeu.nom}
        jaquette={im.jaquette}
        poids={inst.taille}
        dossier={inst.dossier}
        teinte="#3a4a6a"
        jeuEnCours={file?.jeuEnCours ?? null}
        onFermer={onFermer}
      />
    );

  const action = (f: () => void) => () => {
    f();
    onFermer();
  };

  return createPortal(
    <div ref={boite} className="menu-jeu" role="menu" aria-label={`Actions pour ${jeu.nom}`} style={{ left: pos.x, top: pos.y }}>
      <span className="menu-jeu__titre">{jeu.nom}</span>
      {enCours ? (
        <button type="button" role="menuitem" className="menu-jeu__item is-principal" onClick={action(() => installation.ouvrirSuivi(suivi))}>
          Voir le téléchargement
        </button>
      ) : inst ? (
        <button type="button" role="menuitem" className="menu-jeu__item is-principal" onClick={action(() => void api.steamLien({ type: "jouer", appId: jeu.appId }))}>
          ▶ Jouer
        </button>
      ) : (
        <button type="button" role="menuitem" className="menu-jeu__item is-principal" onClick={action(() => installation.ouvrirChoix(suivi))}>
          ⤓ Installer
        </button>
      )}
      <button type="button" role="menuitem" className="menu-jeu__item" onClick={() => setFenetre("proprietes")}>
        ⚙ Propriétés
      </button>
      <button type="button" role="menuitem" className="menu-jeu__item" onClick={action(() => navigate(`/jeu/${jeu.appId}`))}>
        Fiche du jeu
      </button>
      {inst && !enCours && (
        <button type="button" role="menuitem" className="menu-jeu__item" onClick={action(() => void api.ouvrirDossierJeu(jeu.appId))}>
          Ouvrir le dossier
        </button>
      )}
      <button type="button" role="menuitem" className="menu-jeu__item" onClick={action(() => void api.steamLien({ type: "magasin", appId: jeu.appId }))}>
        Page dans Steam
      </button>
      {inst && (
        <>
          <span className="menu-jeu__separateur" />
          <button type="button" role="menuitem" className="menu-jeu__item is-danger" onClick={() => setFenetre("desinstaller")}>
            Désinstaller
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
