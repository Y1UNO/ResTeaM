import { useId } from "react";

type CroissantProps = {
  /** De 0 à 1. */
  valeur: number;
  /** Texte dans le creux (ex. « 18/50 »). */
  texte: string;
  taille?: number;
};

/**
 * Croissant de lune presque fermé qui se remplit (jauge de succès, maquette 01).
 * Tracé repris tel quel : masque lune, arc épais dans le sens horaire.
 */
export function Croissant({ valeur, texte, taille = 84 }: CroissantProps) {
  const masque = `croissant-${useId().replace(/:/g, "")}`;
  const v = Math.min(1, Math.max(0, valeur));
  const echelle = taille / 84;
  return (
    <div style={{ position: "relative", width: taille, height: taille, flex: "0 0 auto" }}>
      <svg aria-hidden="true" width={taille} height={taille} viewBox="0 0 72 72">
        <defs>
          <mask id={masque}>
            <rect width="72" height="72" fill="#000" />
            <circle cx="36" cy="36" r="33" fill="#fff" />
            <circle cx="41" cy="31" r="26.5" fill="#000" />
          </mask>
        </defs>
        <g mask={`url(#${masque})`}>
          <rect width="72" height="72" fill="rgba(255,255,255,.1)" />
          <circle
            cx="36"
            cy="36"
            r="29"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="18"
            strokeDasharray={`${(156 * v).toFixed(1)} 999`}
            transform="matrix(-1 0 0 1 72 0) rotate(-107 36 36)"
            style={{ filter: "drop-shadow(0 0 4px rgba(238,242,255,.6))", transition: "stroke-dasharray .9s cubic-bezier(.2,.7,.2,1)" }}
          />
        </g>
      </svg>
      <span
        style={{
          position: "absolute",
          left: 22 * echelle,
          top: 15 * echelle,
          width: 52 * echelle,
          height: 52 * echelle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-display)",
          fontSize: 15 * echelle,
          fontWeight: 700,
        }}
      >
        {texte}
      </span>
    </div>
  );
}
