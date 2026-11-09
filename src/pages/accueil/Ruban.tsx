import { useRef, useState } from "react";
import { useMoletteHorizontale } from "../../lib/molette";
import { useNavigate } from "react-router-dom";
import type { ImagesJeu, JeuBibliotheque } from "../../api/types";
import { heures } from "../../lib/format";
import { degradeJaquette, imagesDe } from "../../lib/images";
import { PATHS } from "../../app/paths";

export type OngletRuban = "reprendre" | "favoris";

type Props = {
  jeux: JeuBibliotheque[];
  images?: Record<string, ImagesJeu>;
  choisi: number;
  onChoisir: (i: number) => void;
  total: number;
  onglet: OngletRuban;
  onOnglet: (o: OngletRuban) => void;
  nombreFavoris: number;
};

/**
 * Ruban du bas de l'accueil (maquette 01) : « Reprendre » ou « Favoris », la jaquette
 * choisie est ~10 % plus grande, et une dernière carte ouvre toute la bibliothèque.
 */
export function Ruban({ jeux, images, choisi, onChoisir, total, onglet, onOnglet, nombreFavoris }: Props) {
  const navigate = useNavigate();
  const piste = useRef<HTMLDivElement>(null);
  useMoletteHorizontale(piste, onglet);
  const onglets: { id: OngletRuban; libelle: string }[] = [
    { id: "favoris", libelle: `Favoris${nombreFavoris ? ` · ${nombreFavoris}` : ""}` },
    { id: "reprendre", libelle: "Reprendre" },
  ];
  return (
    <section aria-labelledby="ruban-titre" className="ruban">
      <div className="ruban__entete">
        <h2 id="ruban-titre" className="ruban__titre">
          {onglet === "favoris" ? "Tes favoris" : "Reprendre là où tu t’es arrêté"}
        </h2>
        <div className="ruban__onglets" role="tablist" aria-label="Jeux du ruban">
          {onglets.map((o) => (
            <button
              key={o.id}
              type="button"
              role="tab"
              aria-selected={onglet === o.id}
              className={`ruban__onglet${onglet === o.id ? " is-actif" : ""}`}
              onClick={() => onOnglet(o.id)}
            >
              {o.libelle}
            </button>
          ))}
        </div>
      </div>
      <div key={onglet} ref={piste} className="ruban__piste">
        {jeux.length === 0 && (
          <p className="ruban__vide">
            {onglet === "favoris" ? "Aucun favori : ajoute-en dans Steam (étoile sur un jeu)." : "Aucun jeu lancé récemment."}
          </p>
        )}
        {jeux.map((j, i) => (
          <CarteRuban
            key={j.appId}
            jeu={j}
            jaquette={imagesDe(j.appId, images).jaquette}
            choisie={i === choisi}
            onClick={() => onChoisir(i)}
          />
        ))}
        <button
          type="button"
          className="rib rib--tous"
          onClick={() => navigate(PATHS.bibliotheque)}
          aria-label={`Tous les jeux (${total})`}
        >
          <span className="rib__tous-icone" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span className="rib__tous-texte">
            <strong>Tous les jeux</strong>
            <span>{total} sur Steam</span>
          </span>
        </button>
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
        ? `${inst.aTelecharger > 0 ? Math.round((inst.telecharge / inst.aTelecharger) * 100) : 0} %`
        : inst?.etat === "enPause"
          ? "En pause"
          : null;
  const image = jaquette && !ratee;
  return (
    <button
      type="button"
      className={`rib${choisie ? " is-choisie" : ""}`}
      data-lueur=""
      onClick={onClick}
      aria-pressed={choisie}
      aria-label={`${jeu.nom}, ${heures(jeu.minutesTotal)}`}
    >
      <div className="rib__art" style={image ? undefined : { background: degradeJaquette(jeu.nom) }}>
        {image && <img src={jaquette!} alt="" draggable={false} loading="lazy" onError={() => setRatee(true)} />}
        {badge && <span className="rib__badge">{badge}</span>}
        {(inst?.etat === "telechargement" || inst?.etat === "enPause") && inst.aTelecharger > 0 && (
          <span className="rib__progression" aria-hidden="true">
            <div style={{ width: `${Math.min(100, (inst.telecharge / inst.aTelecharger) * 100)}%` }} />
          </span>
        )}
        {!image && <span className="rib__titre">{jeu.nom}</span>}
      </div>
      <div className="rib__bas">
        <span>{jeu.minutesTotal > 0 ? heures(jeu.minutesTotal) : "Jamais lancé"}</span>
        <span className="rib__droite">
          {inst?.etat === "telechargement" || inst?.etat === "enPause" ? "En cours" : inst ? "Jouer" : "Installer"}
        </span>
      </div>
    </button>
  );
}
