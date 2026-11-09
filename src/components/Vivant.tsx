import { useEffect, useRef, useState, type CSSProperties } from "react";
import { entier, heures as enHeures } from "../lib/format";

/** Petit générateur stable : les lucioles ne bougent pas d'un rendu à l'autre. */
function hasard(graine: number) {
  let s = graine;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Lucioles : quelques lueurs qui dérivent et s'allument doucement dans le fond
 * (de la vie sans attirer l'œil). Uniquement des transformations CSS.
 */
export function Lucioles({ nombre = 14, couleur, graine = 7, zone }: { nombre?: number; couleur?: string; graine?: number; zone?: CSSProperties }) {
  const [points] = useState(() => {
    const r = hasard(graine);
    return Array.from({ length: nombre }, () => ({
      left: `${(r() * 100).toFixed(1)}%`,
      top: `${(r() * 100).toFixed(1)}%`,
      taille: 2 + r() * 2.5,
      duree: `${16 + r() * 18}s`,
      brille: `${3 + r() * 4}s`,
      delai: `${-r() * 20}s`,
      dx: `${(r() - 0.5) * 120}px`,
      dy: `${-20 - r() * 70}px`,
      force: (0.35 + r() * 0.5).toFixed(2),
    }));
  });
  return (
    <div className="lucioles" aria-hidden="true" style={{ ...zone, ...(couleur ? ({ "--luciole": couleur } as CSSProperties) : {}) }}>
      {points.map((p, i) => (
        <span
          key={i}
          className="luciole"
          style={
            {
              left: p.left,
              top: p.top,
              width: p.taille,
              height: p.taille,
              "--duree": p.duree,
              "--brille": p.brille,
              "--delai": p.delai,
              "--dx": p.dx,
              "--dy": p.dy,
              "--force": p.force,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/**
 * Nombre qui défile jusqu'à sa valeur (0 → 1 234). Si l'animation ne peut pas
 * tourner (fenêtre cachée), la valeur finale s'affiche quand même.
 */
export function Compteur({ valeur, duree = 1100, heures = false }: { valeur: number; duree?: number; heures?: boolean }) {
  const [affiche, setAffiche] = useState(0);
  const depart = useRef(0);
  useEffect(() => {
    const de = depart.current;
    const t0 = performance.now();
    let anim = 0;
    const pas = (t: number) => {
      const p = Math.min(1, (t - t0) / duree);
      const e = 1 - Math.pow(1 - p, 3);
      setAffiche(de + (valeur - de) * e);
      if (p < 1) anim = requestAnimationFrame(pas);
    };
    anim = requestAnimationFrame(pas);
    const secours = window.setTimeout(() => setAffiche(valeur), duree + 150);
    depart.current = valeur;
    return () => {
      cancelAnimationFrame(anim);
      window.clearTimeout(secours);
    };
  }, [valeur, duree]);
  return <>{heures ? enHeures(Math.round(affiche)) : entier(Math.round(affiche))}</>;
}
