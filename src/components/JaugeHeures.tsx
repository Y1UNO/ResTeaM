import { heures } from "../lib/format";
import { NOMS_RANGS, PALIERS, rangDepuisMinutes } from "../lib/rangs";
import { BadgeRang } from "./BadgeRang";
import "./JaugeHeures.css";

/**
 * Carte « temps de jeu total » de la maquette 01 : total, rang (nom + chiffre romain
 * dans un cercle lunaire), jauge à 9 paliers et prochain palier.
 */
export function JaugeHeures({ minutes }: { minutes: number }) {
  const r = rangDepuisMinutes(minutes);
  return (
    <div className="jauge carte-verre">
      <div className="jauge__haut">
        <div className="jauge__total">
          <span className="jauge__chiffre">{heures(minutes)}</span>
          <span className="jauge__libelle">temps de jeu total</span>
        </div>
        <div className="jauge__rang">
          <div className="jauge__rang-texte">
            <strong>{r.nom}</strong>
            <span>Rang {r.romain}</span>
          </div>
          <BadgeRang niveau={r.niveau} taille={50} />
        </div>
      </div>
      <div className="jauge__segments" role="img" aria-label={`Rang ${r.nom}, ${heures(minutes)}`}>
        {r.segments.map((s, i) => (
          <div
            key={i}
            className={`jauge__segment${s >= 1 ? " is-plein" : s > 0 ? " is-partiel" : ""}`}
            title={`${NOMS_RANGS[i]} · ${PALIERS[i]} h`}
            style={{ "--i": i } as React.CSSProperties}
          >
            <div style={{ width: `${Math.round(s * 100)}%` }} />
          </div>
        ))}
      </div>
      <span className="jauge__libelle">
        {r.prochain
          ? `Prochain : ${r.prochain.nom} à ${r.prochain.heures} h · encore ${String(r.prochain.reste).replace(".", ",")} h`
          : "Rang maximum atteint"}
      </span>
    </div>
  );
}
