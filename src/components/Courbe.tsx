import { useId, type CSSProperties } from "react";
import "./Courbe.css";

/** Courbe lisse (Catmull-Rom → Bézier) qui passe par tous les points. */
function chemin(points: [number, number][]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0][0]},${points[0][1]}`;
  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

type Props = {
  /** Valeurs dans l'ordre du temps (la plus récente à droite). `null` = pas de relevé. */
  valeurs: (number | null)[];
  /** Couleur principale de la courbe (CSS). */
  couleur?: string;
  hauteur?: number;
  /** Échelle : sinon le maximum des valeurs. */
  max?: number;
  /** Texte quand il n'y a pas encore assez de points. */
  attente?: string;
};

/**
 * Courbe vivante : aire en dégradé, trait lumineux, point final qui pulse, et un
 * passage de lumière qui la parcourt. Quand les valeurs changent, la forme se
 * transforme en douceur (transition CSS de `d`). Sans données, une ligne de
 * balayage montre qu'elle attend.
 */
export function Courbe({ valeurs, couleur = "#eef2ff", hauteur = 120, max, attente = "En attente des premiers relevés…" }: Props) {
  const id = useId().replace(/:/g, "");
  const L = 1000;
  const H = hauteur;
  const n = Math.max(2, valeurs.length);
  const presents = valeurs.map((v, i) => [i, v] as const).filter((x): x is readonly [number, number] => x[1] != null);
  const haut = Math.max(1, max ?? Math.max(...presents.map((x) => x[1]), 1));
  const pts: [number, number][] = presents.map(([i, v]) => [(i / (n - 1)) * L, H - 8 - (v / haut) * (H - 22)]);
  const ligne = chemin(pts);
  const aire = pts.length >= 2 ? `${ligne} L${pts[pts.length - 1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z` : "";
  const dernier = pts[pts.length - 1];

  return (
    <div className="courbe" style={{ height: H, "--courbe": couleur } as CSSProperties}>
      <svg viewBox={`0 0 ${L} ${H}`} preserveAspectRatio="none" className="courbe__svg" aria-hidden="true">
        <defs>
          <linearGradient id={`aire${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={couleur} stopOpacity="0.38" />
            <stop offset="1" stopColor={couleur} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`passage${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
            <animate attributeName="x1" values="-0.6;1" dur="3.4s" repeatCount="indefinite" />
            <animate attributeName="x2" values="0;1.6" dur="3.4s" repeatCount="indefinite" />
          </linearGradient>
        </defs>
        {/* Graduations discrètes */}
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2={L} y1={H * g} y2={H * g} className="courbe__grille" />
        ))}
        {pts.length >= 2 ? (
          <>
            <path className="courbe__aire" style={{ d: `path("${aire}")` } as CSSProperties} fill={`url(#aire${id})`} />
            <path className="courbe__ligne" style={{ d: `path("${ligne}")` } as CSSProperties} stroke={couleur} />
          </>
        ) : (
          <line className="courbe__base" x1="0" x2={L} y1={H - 8} y2={H - 8} />
        )}
      </svg>
      {dernier && (
        <span className="courbe__point" style={{ left: `${(dernier[0] / L) * 100}%`, top: dernier[1] }}>
          <span />
        </span>
      )}
      {pts.length < 2 && (
        <>
          <span className="courbe__balayage" aria-hidden="true" />
          <span className="courbe__attente">{attente}</span>
        </>
      )}
    </div>
  );
}
