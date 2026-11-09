import { useId } from "react";
import "./Croissant.css";

type CroissantProps = {
  /** De 0 à 1. */
  valeur: number;
  /** Texte dans le creux (ex. « 18/50 »). */
  texte: string;
  taille?: number;
};

/**
 * Croissant de lune qui se remplit (jauge de succès, maquette 01), animé :
 * il se remplit à l'arrivée, sa lueur respire et un reflet parcourt l'arc.
 * À 100 % (demande de Tom), il devient bleu lunaire brillant, avec un halo
 * qui tourne et des éclats d'étoiles.
 */
export function Croissant({ valeur, texte, taille = 84 }: CroissantProps) {
  const id = useId().replace(/:/g, "");
  const v = Math.min(1, Math.max(0, valeur));
  const complet = v >= 1;
  const echelle = taille / 84;
  const longueur = (156 * v).toFixed(1);
  return (
    <div className={`croissant${complet ? " is-complet" : ""}`} style={{ width: taille, height: taille }}>
      {complet && (
        <>
          <span className="croissant__halo" aria-hidden="true" />
          <span className="croissant__eclats" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
        </>
      )}
      <svg aria-hidden="true" width={taille} height={taille} viewBox="0 0 72 72" className="croissant__svg">
        <defs>
          <mask id={`m${id}`}>
            <rect width="72" height="72" fill="#000" />
            <circle cx="36" cy="36" r="33" fill="#fff" />
            <circle cx="41" cy="31" r="26.5" fill="#000" />
          </mask>
          <linearGradient id={`plein${id}`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor={complet ? "#7cc8ff" : "#eef2ff"} />
            <stop offset="1" stopColor={complet ? "#e6f6ff" : "#cfd8f0"} />
          </linearGradient>
          {/* Reflet : une bande claire qui tourne le long de l'arc. */}
          <linearGradient id={`reflet${id}`} x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
            <stop offset="0.35" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity={complet ? 0.95 : 0.7} />
            <stop offset="0.65" stopColor="#fff" stopOpacity="0" />
            {complet && <animateTransform attributeName="gradientTransform" type="rotate" from="0 0.5 0.5" to="360 0.5 0.5" dur="3.2s" repeatCount="indefinite" />}
          </linearGradient>
        </defs>
        <g mask={`url(#m${id})`}>
          <rect width="72" height="72" fill={complet ? "rgba(124,200,255,.16)" : "rgba(255,255,255,.1)"} />
          <g transform="matrix(-1 0 0 1 72 0) rotate(-107 36 36)">
            <circle
              className="croissant__arc"
              cx="36"
              cy="36"
              r="29"
              fill="none"
              stroke={`url(#plein${id})`}
              strokeWidth="18"
              strokeDasharray={`${longueur} 999`}
              style={{ "--longueur": longueur } as React.CSSProperties}
            />
            <circle className="croissant__reflet" cx="36" cy="36" r="29" fill="none" stroke={`url(#reflet${id})`} strokeWidth="18" strokeDasharray={`${longueur} 999`} />
          </g>
          {complet && (
            <g className="croissant__crateres" fill="#3a8fd0" opacity="0.28">
              <circle cx="16" cy="40" r="2.6" />
              <circle cx="22" cy="54" r="1.8" />
              <circle cx="12" cy="28" r="1.4" />
            </g>
          )}
        </g>
      </svg>
      <span
        className="croissant__texte"
        style={{ left: 22 * echelle, top: 15 * echelle, width: 52 * echelle, height: 52 * echelle, fontSize: 15 * echelle }}
      >
        {texte}
      </span>
    </div>
  );
}
