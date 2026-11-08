import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ImagesJeu, JeuBibliotheque } from "../../api/types";
import { heures } from "../../lib/format";
import { degradeJaquette, imagesDe } from "../../lib/images";
import { PATHS } from "../../app/paths";

type Props = {
  jeux: JeuBibliotheque[];
  images?: Record<string, ImagesJeu>;
  choisi: number;
  onChoisir: (i: number) => void;
  total: number;
};

/** Ruban « Reprendre là où tu t'es arrêté » (maquette 01). La jaquette choisie est ~10 % plus grande. */
export function Ruban({ jeux, images, choisi, onChoisir, total }: Props) {
  const navigate = useNavigate();
  return (
    <section aria-labelledby="ruban-titre" className="ruban">
      <div className="ruban__entete">
        <h2 id="ruban-titre" className="ruban__titre">
          Reprendre là où tu t’es arrêté
        </h2>
        <button type="button" className="ruban__lien" onClick={() => navigate(PATHS.bibliotheque)}>
          Tous les jeux ({total}) →
        </button>
      </div>
      <div className="ruban__piste">
        {jeux.map((j, i) => (
          <CarteRuban
            key={j.appId}
            jeu={j}
            jaquette={imagesDe(j.appId, images).jaquette}
            choisie={i === choisi}
            onClick={() => onChoisir(i)}
          />
        ))}
      </div>
    </section>
  );
}

function CarteRuban({
  jeu,
  jaquette,
  choisie,
  onClick,
}: {
  jeu: JeuBibliotheque;
  jaquette: string | null;
  choisie: boolean;
  onClick: () => void;
}) {
  const [ratee, setRatee] = useState(false);
  const inst = jeu.installation;
  const badge =
    inst?.etat === "miseAJourRequise"
      ? "Mise à jour"
      : inst?.etat === "telechargement"
        ? "Téléchargement"
        : inst?.etat === "enPause"
          ? "En pause"
          : null;
  const image = jaquette && !ratee;
  return (
    <button
      type="button"
      className={`rib${choisie ? " is-choisie" : ""}`}
      onClick={onClick}
      aria-pressed={choisie}
      aria-label={`${jeu.nom}, ${heures(jeu.minutesTotal)}`}
    >
      <div className="rib__art" style={image ? undefined : { background: degradeJaquette(jeu.nom) }}>
        {image && <img src={jaquette!} alt="" draggable={false} loading="lazy" onError={() => setRatee(true)} />}
        {badge && <span className="rib__badge">{badge}</span>}
        {!image && <span className="rib__titre">{jeu.nom}</span>}
      </div>
      <div className="rib__bas">
        <span>{jeu.minutesTotal > 0 ? heures(jeu.minutesTotal) : "Jamais lancé"}</span>
        <span className="rib__droite">{inst ? "Jouer" : "Installer"}</span>
      </div>
    </button>
  );
}
