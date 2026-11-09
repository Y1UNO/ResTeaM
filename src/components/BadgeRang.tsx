import { useId, type CSSProperties } from "react";
import { NOMS_RANGS, ROMAINS } from "../lib/rangs";
import "./BadgeRang.css";

/**
 * Teintes par rang (0 Novice → IX Éternel) : du blanc lunaire à l'argent,
 * puis bleu de lune, violet nocturne, or pâle et enfin irisé.
 */
const TEINTES: [string, string][] = [
  ["#8e8e94", "#5a5a60"], // Novice
  ["#eef2ff", "#aeb8d6"], // I Éveillé
  ["#eef2ff", "#9fb3e6"], // II Initié
  ["#dfe8ff", "#8ea9e8"], // III Habitué
  ["#cfe4ff", "#6f9fe6"], // IV Vétéran
  ["#bfe6ff", "#4fa6e6"], // V Expert
  ["#c9d6ff", "#7a7cf0"], // VI Maître
  ["#e2cfff", "#9a6af0"], // VII Légende
  ["#ffe9b8", "#e0a84f"], // VIII Mythe
  ["#ffffff", "#9fe6ff"], // IX Éternel (irisé, animé)
];

/** Dents d'un engrenage (rang VI et plus). */
function dents(cx: number, cy: number, r1: number, r2: number, n: number) {
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = a + (Math.PI * 2) / n / 2.2;
    const p = (r: number, t: number) => `${(cx + Math.cos(t) * r).toFixed(2)} ${(cy + Math.sin(t) * r).toFixed(2)}`;
    d += `M${p(r1, a)}L${p(r2, a + 0.04)}L${p(r2, b - 0.04)}L${p(r1, b)}`;
  }
  return d;
}

/**
 * Badge de rang animé (demande de Tom) : chaque rang ajoute un élément au dessin
 * (graduations, anneau tournant, bouclier, lianes, engrenage, croissant et étoiles,
 * rayons, couronne irisée) et l'aura / les flammes s'intensifient avec le rang.
 * `anime={false}` pour les petites tailles répétées (grille de la bibliothèque).
 */
export function BadgeRang({ niveau, taille = 46, anime = true, titre }: { niveau: number; taille?: number; anime?: boolean; titre?: string }) {
  const id = useId().replace(/:/g, "");
  const n = Math.max(0, Math.min(9, niveau));
  const [clair, fonce] = TEINTES[n];
  const romain = n === 0 ? "0" : ROMAINS[n - 1];
  const nom = n === 0 ? "Novice" : NOMS_RANGS[n - 1];
  const flammes = n >= 5 ? n - 2 : 0;
  const style = { width: taille, height: taille, "--br-clair": clair, "--br-fonce": fonce, "--br-force": (n / 9).toFixed(2) } as CSSProperties;

  return (
    <span className={`badge-rang n${n}${anime ? " is-anime" : ""}`} style={style} title={titre ?? `Rang ${romain} · ${nom}`} role="img" aria-label={`Rang ${romain} · ${nom}`}>
      {n >= 1 && <span className="badge-rang__aura" aria-hidden="true" />}
      {flammes > 0 && (
        <span className="badge-rang__flammes" aria-hidden="true">
          {Array.from({ length: flammes }, (_, i) => (
            <span key={i} style={{ "--a": `${(i / flammes) * 360}deg`, "--d": `${(i * 0.37) % 1.4}s` } as CSSProperties} />
          ))}
        </span>
      )}
      <svg viewBox="0 0 64 64" width={taille} height={taille} aria-hidden="true" className="badge-rang__svg">
        <defs>
          <linearGradient id={`br-g${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={clair} />
            <stop offset="1" stopColor={fonce} />
          </linearGradient>
          <radialGradient id={`br-f${id}`} cx="0.5" cy="0.4" r="0.6">
            <stop offset="0" stopColor={fonce} stopOpacity="0.35" />
            <stop offset="1" stopColor="#09090a" stopOpacity="0.9" />
          </radialGradient>
        </defs>

        {/* VIII+ : rayons */}
        {n >= 8 && (
          <g className="br-rayons" stroke={`url(#br-g${id})`} strokeWidth="1.6" strokeLinecap="round">
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i / 12) * Math.PI * 2;
              const r1 = i % 2 ? 28 : 27;
              const r2 = i % 2 ? 31 : 33;
              return <line key={i} x1={32 + Math.cos(a) * r1} y1={32 + Math.sin(a) * r1} x2={32 + Math.cos(a) * r2} y2={32 + Math.sin(a) * r2} />;
            })}
          </g>
        )}

        {/* VI+ : engrenage qui tourne lentement */}
        {n >= 6 && <path className="br-engrenage" d={dents(32, 32, 25.5, 29, n >= 9 ? 18 : 14)} fill={`url(#br-g${id})`} opacity="0.9" />}

        {/* IV+ : bouclier hexagonal */}
        {n >= 4 && (
          <path
            d="M32 6 L54 18 L54 42 Q54 50 32 58 Q10 50 10 42 L10 18 Z"
            fill={`url(#br-f${id})`}
            stroke={`url(#br-g${id})`}
            strokeWidth="1.4"
            opacity="0.95"
            transform={n >= 6 ? "translate(32 32) scale(0.82) translate(-32 -32)" : undefined}
          />
        )}

        {/* Anneau principal */}
        <circle cx="32" cy="32" r={n >= 4 ? 19 : 22} fill={n >= 4 ? "none" : `url(#br-f${id})`} stroke={`url(#br-g${id})`} strokeWidth={n === 0 ? 1.6 : 2.4} opacity={n === 0 ? 0.5 : 1} />

        {/* III+ : anneau pointillé qui tourne */}
        {n >= 3 && <circle className="br-tour" cx="32" cy="32" r={n >= 4 ? 23 : 26} fill="none" stroke={clair} strokeOpacity="0.55" strokeWidth="1" strokeDasharray="2 4" />}

        {/* II+ : graduations cardinales */}
        {n >= 2 &&
          [0, 90, 180, 270].map((a) => (
            <rect key={a} x="31.2" y={n >= 4 ? 10.5 : 7.5} width="1.6" height="4" rx="0.8" fill={clair} transform={`rotate(${a} 32 32)`} opacity="0.9" />
          ))}

        {/* V+ : lianes et feuilles en bas */}
        {n >= 5 && (
          <g className="br-lianes" fill="none" stroke={`url(#br-g${id})`} strokeWidth="1.3" strokeLinecap="round">
            <path d="M18 44 Q22 52 32 54 Q42 52 46 44" />
            <path d="M21 47 q-4 -1 -5 -5 q4 0 5 5z M43 47 q4 -1 5 -5 q-4 0 -5 5z M26 51 q-3 1 -6 -1 q3 -2 6 1z M38 51 q3 1 6 -1 q-3 -2 -6 1z" fill={clair} fillOpacity="0.85" stroke="none" />
          </g>
        )}

        {/* VII+ : croissant de lune et étoiles */}
        {n >= 7 && (
          <g className="br-lune">
            <path d="M32 3.5 a6 6 0 1 0 5.5 8.2 a4.6 4.6 0 1 1 -5.5 -8.2z" fill={clair} />
            <circle className="br-etoile" cx="47" cy="9" r="1.1" fill={clair} />
            <circle className="br-etoile e2" cx="17" cy="10" r="0.9" fill={clair} />
            <circle className="br-etoile e3" cx="54" cy="26" r="0.8" fill={clair} />
          </g>
        )}

        {/* I : petit croissant discret à côté du chiffre */}
        {n === 1 && <path d="M44 20 a4 4 0 1 0 3.6 5.4 a3 3 0 1 1 -3.6 -5.4z" fill={clair} opacity="0.85" />}

        <text x="32" y="32" dy="0.36em" textAnchor="middle" className="br-chiffre" fill={n === 0 ? "#a3a3a8" : clair} fontSize={romain.length > 2 ? 11 : romain.length > 1 ? 13 : 15}>
          {romain}
        </text>
      </svg>
    </span>
  );
}
