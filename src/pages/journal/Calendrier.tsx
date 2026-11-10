import type { CSSProperties } from "react";
import { cleJour, duree, intensite, semaines, type Nuit } from "../../lib/journal";
import "./journal.css";

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const JOURS = ["lun.", "", "mer.", "", "ven.", "", "dim."];

/**
 * Calendrier des « nuits de jeu » : une case par nuit, plus lumineuse (lune qui
 * s'allume) quand on a joué longtemps. Colonnes = semaines, lignes = lundi → dimanche.
 */
export function Calendrier({
  nuits,
  depuis,
  jusqu,
  choisie,
  onChoisir,
  petit = false,
}: {
  nuits: Map<string, Nuit>;
  depuis: Date;
  jusqu: Date;
  choisie?: string | null;
  onChoisir?: (cle: string) => void;
  petit?: boolean;
}) {
  const grille = semaines(depuis, jusqu);
  const aujourdhui = cleJour(new Date());
  return (
    <div
      className={`calendrier${petit ? " is-petit" : grille.length <= 14 ? " is-grand" : grille.length <= 28 ? " is-moyen" : ""}`}
      role="grid"
      aria-label="Nuits de jeu"
    >
      <div className="calendrier__mois" aria-hidden="true" style={{ "--semaines": grille.length } as CSSProperties}>
        {grille.map((s, i) => {
          const premier = s.find((d) => d.getDate() === 1);
          return <span key={i}>{premier || i === 0 ? MOIS[(premier ?? s[0]).getMonth()] : ""}</span>;
        })}
      </div>
      <div className="calendrier__corps">
        {!petit && (
          <div className="calendrier__jours" aria-hidden="true">
            {JOURS.map((j, i) => (
              <span key={i}>{j}</span>
            ))}
          </div>
        )}
        <div className="calendrier__grille" style={{ "--semaines": grille.length } as CSSProperties}>
          {grille.map((s, i) => (
            <div key={i} className="calendrier__semaine" role="row">
              {s.map((d) => {
                const cle = cleJour(d);
                const n = nuits.get(cle);
                const hors = d < depuis || d > jusqu;
                const niveau = n ? intensite(n.minutes) : 0;
                const titre = `${d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} · ${n ? duree(n.minutes) : "pas joué"}`;
                return (
                  <button
                    key={cle}
                    type="button"
                    role="gridcell"
                    className={`calendrier__case n${niveau}${hors ? " is-hors" : ""}${cle === choisie ? " is-choisie" : ""}${cle === aujourdhui ? " is-aujourdhui" : ""}`}
                    title={titre}
                    aria-label={titre}
                    disabled={hors || !onChoisir}
                    onClick={() => onChoisir?.(cle)}
                    style={{ animationDelay: `${Math.min(i * 18, 900)}ms` }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {!petit && (
        <div className="calendrier__legende" aria-hidden="true">
          <span>Moins</span>
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <i key={n} className={`calendrier__case n${n}`} />
          ))}
          <span>Plus</span>
        </div>
      )}
    </div>
  );
}
