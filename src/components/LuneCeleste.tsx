import { useId, type ReactNode } from "react";
import "./LuneCeleste.css";

type Props = {
  /** Niveau ResTeaM, de 1 à 30. */
  niveau: number;
  /** Remplissage du croissant (progression vers le niveau suivant), de 0 à 1. */
  fraction?: number;
  /** Taille en pixels (dessin de référence : 96). */
  taille?: number;
  /** Texte dans le creux (le numéro du niveau). */
  texte?: ReactNode;
};

/** Teintes du croissant selon le palier. */
function teinte(n: number): [string, string] {
  if (n >= 20) return ["#ffffff", "#d7deee"];
  if (n >= 10) return ["#e6f6ff", "#8fcfff"];
  return ["#ffffff", "#afc0e8"];
}

/**
 * Lune du profil à 30 niveaux (idée de Tom) : chaque niveau ajoute un détail, et les
 * paliers 5, 10, 15, 20, 25 et 30 changent franchement le style. Tout bouge en
 * transform et opacité.
 */
export function LuneCeleste({ niveau, fraction = 1, taille = 96, texte }: Props) {
  const id = useId().replace(/:/g, "");
  const n = Math.min(30, Math.max(1, Math.round(niveau)));
  const v = Math.min(1, Math.max(0, fraction));
  const [c1, c2] = teinte(n);
  const palier = Math.floor(n / 5) * 5;
  const poussiere = n >= 6 ? Math.min(14, 4 + (n - 6) * 2) : 0;
  const satellites = n >= 12 ? Math.min(3, n - 11) : 0;

  return (
    <div className={`lc p${palier}`} style={{ width: taille, height: taille }} data-niveau={n}>
      <div className="lc__echelle" style={{ transform: `scale(${taille / 96})` }}>
        {n >= 25 && <span className={`lc__couronne${n >= 26 ? " is-vive" : ""}`} aria-hidden="true" />}
        {n >= 27 && (
          <span className="lc__vagues" aria-hidden="true">
            <span />
            <span />
          </span>
        )}
        {n >= 20 && <span className="lc__aurore" aria-hidden="true" />}
        {n >= 4 && <span className={`lc__halo${n >= 5 ? " is-respire" : ""}${n >= 17 ? " is-large" : ""}`} aria-hidden="true" />}
        {n >= 10 && <span className="lc__anneau" aria-hidden="true" />}
        {n >= 11 && <span className="lc__anneau is-2" aria-hidden="true" />}
        {poussiere > 0 && (
          <span className="lc__poussiere" aria-hidden="true">
            {Array.from({ length: poussiere }, (_, i) => (
              <span key={i} style={{ transform: `rotate(${(360 / poussiere) * i}deg) translateX(${50 + (i % 3) * 3}px)` }} />
            ))}
          </span>
        )}
        {satellites > 0 && (
          <span className="lc__satellites" aria-hidden="true">
            {Array.from({ length: satellites }, (_, i) => (
              <span key={i} className={`s${i}`}>
                <span />
              </span>
            ))}
          </span>
        )}
        <div className="lc__disque" aria-hidden="true" />
        <svg aria-hidden="true" width="96" height="96" viewBox="0 0 72 72" className={`lc__svg${n >= 8 ? " is-vif" : ""}`}>
          <defs>
            <linearGradient id={`lcG${id}`} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor={c1} />
              <stop offset="1" stopColor={c2} />
            </linearGradient>
            <mask id={`lcM${id}`}>
              <rect width="72" height="72" fill="#000" />
              <circle cx="36" cy="36" r="31" fill="#fff" />
              <circle cx="42" cy="30" r="25" fill="#000" />
            </mask>
          </defs>
          <g mask={`url(#lcM${id})`}>
            <rect width="72" height="72" fill={n >= 10 ? "rgba(143,207,255,.14)" : "rgba(238,242,255,.14)"} />
            <g transform="matrix(-1 0 0 1 72 0) rotate(-104 36 36)">
              <circle cx="36" cy="36" r="28" fill="none" stroke={`url(#lcG${id})`} strokeWidth="18" strokeDasharray={`${(152 * v).toFixed(1)} 999`} className="lc__arc" />
              {/* Niveau 30 : deux voiles de couleur qui se relaient (opacité seulement). */}
              {n >= 30 && (
                <>
                  <circle cx="36" cy="36" r="28" fill="none" stroke="#ff9ed8" strokeWidth="18" strokeDasharray={`${(152 * v).toFixed(1)} 999`} className="lc__teinte t1" />
                  <circle cx="36" cy="36" r="28" fill="none" stroke="#7ee2ff" strokeWidth="18" strokeDasharray={`${(152 * v).toFixed(1)} 999`} className="lc__teinte t2" />
                </>
              )}
            </g>
            {n >= 2 && (
              <g className="lc__crateres" fill={n >= 10 ? "#3a8fd0" : "#6f7da3"}>
                <circle cx="13" cy="40" r="2.4" />
                <circle cx="19" cy="54" r="1.7" />
                <circle cx="10" cy="28" r="1.3" />
              </g>
            )}
            {n >= 21 && <rect x="-20" y="0" width="16" height="72" fill="#fff" className="lc__reflet" />}
          </g>
          {n >= 3 && <circle cx="58" cy="13" r="1.5" fill="#EEF2FF" className="lc__etoile" />}
          {n >= 4 && <circle cx="64" cy="22" r=".9" fill="#EEF2FF" className="lc__etoile is-2" />}
        </svg>
        {n >= 5 && (
          <span className="lc__etoiles" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        )}
        {n >= 15 && (
          <svg aria-hidden="true" className="lc__constellation" width="150" height="150" viewBox="0 0 150 150">
            <polyline points="14,40 32,18 58,10 86,6" />
            <polyline points="118,120 136,98 142,70" />
            {[
              [14, 40],
              [32, 18],
              [58, 10],
              [86, 6],
              [118, 120],
              [136, 98],
              [142, 70],
            ].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="1.6" style={{ animationDelay: `${0.25 * i}s` }} />
            ))}
          </svg>
        )}
        {n >= 16 && <span className="lc__filante" aria-hidden="true" />}
        {n >= 19 && <span className="lc__filante is-2" aria-hidden="true" />}
        {n >= 21 && (
          <span className="lc__particules" aria-hidden="true">
            {Array.from({ length: Math.min(8, 3 + (n - 21)) }, (_, i) => (
              <span key={i} style={{ left: `${12 + i * 10}%`, animationDelay: `${(i * 0.7) % 3}s` }} />
            ))}
          </span>
        )}
        {n >= 30 && <span className="lc__comete" aria-hidden="true" />}
        {texte != null && <div className="lc__texte">{texte}</div>}
      </div>
    </div>
  );
}
