/**
 * Ornements de la fenêtre d'installation (design de Tom, Claude Design, 8 nov. 2026) :
 * lianes vertes qui se dessinent, feuilles qui se déplient, fleurs blanches,
 * engrenages métalliques aux moyeux verts (comme le logo).
 */

/** Contour d'engrenage : `n` dents entre les rayons `ri` et `ro`. */
export function engrenage(ro: number, ri: number, n: number): string {
  const pts: string[] = [];
  const pas = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const a = pas * i;
    for (const [r, b] of [
      [ri, a],
      [ro, a + pas * 0.12],
      [ro, a + pas * 0.54],
      [ri, a + pas * 0.66],
    ] as const) {
      pts.push(`${(r * Math.cos(b)).toFixed(2)} ${(r * Math.sin(b)).toFixed(2)}`);
    }
  }
  return `M${pts.join(" L")} Z`;
}

/** Dégradés partagés (une seule fois dans la page, ids préfixés). */
export function DefsLianes() {
  return (
    <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
      <defs>
        <linearGradient id="inst-metal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5A6367" />
          <stop offset=".45" stopColor="#2F3538" />
          <stop offset="1" stopColor="#1C2022" />
        </linearGradient>
        <linearGradient id="inst-tige" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#145C36" />
          <stop offset=".55" stopColor="#2BB86E" />
          <stop offset="1" stopColor="#7DFFB6" />
        </linearGradient>
        <linearGradient id="inst-feuille" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1E8A50" />
          <stop offset=".6" stopColor="#3FE08A" />
          <stop offset="1" stopColor="#A6FFCB" />
        </linearGradient>
        <linearGradient id="inst-feuille2" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#145C36" />
          <stop offset="1" stopColor="#2BB86E" />
        </linearGradient>
        <linearGradient id="inst-barre" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1E7A48" />
          <stop offset="1" stopColor="#7DFFB6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Engrenage métallique détaillé (dents, rayons, moyeu vert), qui apparaît puis tourne. */
export function EngrenageMetal({ x, y, ro, ri, n, sens = 1 }: { x: number; y: number; ro: number; ri: number; n: number; sens?: 1 | -1 }) {
  const interieur = ri * 0.74;
  const rayon = ri * 0.45;
  const c = 2 * Math.PI * rayon;
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="inst-gear-in">
        <g className={sens === 1 ? "inst-spin" : "inst-spin-r"}>
          <path d={engrenage(ro, ri, n)} fill="url(#inst-metal)" stroke="#6E777B" strokeWidth=".8" strokeLinejoin="round" />
          <circle r={interieur} fill="#16191B" />
          <circle r={rayon} fill="none" stroke="url(#inst-metal)" strokeWidth={ri * 0.5} strokeDasharray={`${c * 0.07} ${c * 0.13}`} />
        </g>
        <circle r={ri * 0.3} fill="#22272A" stroke="#3FE08A" strokeWidth={Math.max(1.2, ri * 0.12)} />
        <circle r={ri * 0.1} fill="#0E1011" />
      </g>
    </g>
  );
}

type FeuilleProps = { x: number; y: number; r: number; s?: number; i: number; delai: number };

/** Feuille nervurée qui se déplie, puis frémit doucement. */
export function Feuille({ x, y, r, s = 1, i, delai }: FeuilleProps) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      <g className="inst-frisson" style={{ animationDuration: `${4 + ((i * 1.7) % 3)}s`, animationDelay: `${-i * 0.8}s` }}>
        <g className="inst-feuille" style={{ animationDelay: `${delai + i * 0.11}s` }}>
          <path d="M0 0 C 6 -10 19 -11 27 -1 C 19 7 7 8 0 0 Z" fill={`url(#inst-${i % 3 === 2 ? "feuille2" : "feuille"})`} />
          <path d="M1 0 C 9 -2 17 -2 25 -1" stroke="rgba(6,30,16,.6)" strokeWidth=".9" fill="none" />
          <path d="M8 -1.6 L 12 -5.5 M14 -1.4 L 18 -5" stroke="rgba(6,30,16,.4)" strokeWidth=".6" fill="none" />
        </g>
      </g>
    </g>
  );
}

/** Petite fleur blanche à cinq pétales, cœur vert. */
export function Fleur({ x, y, s = 1, delai }: { x: number; y: number; s?: number; delai: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="inst-bouton" style={{ animationDelay: `${delai}s` }}>
        {[0, 72, 144, 216, 288].map((a, i) => (
          <ellipse key={a} rx="3.4" ry="6" cy="-5.5" fill={i === 2 || i === 3 ? "#EEF2FF" : "#F7F9FF"} transform={`rotate(${a})`} />
        ))}
        <circle r="2.6" fill="#3FE08A" />
        <circle r="1.1" fill="#E8FFF1" />
      </g>
    </g>
  );
}

/** Une tige en trois couches : ombre, dégradé vert, reflet clair. Se dessine à l'apparition. */
function Tige({ d, epaisseur }: { d: string; epaisseur: number }) {
  return (
    <>
      <path className="inst-dessine" pathLength={100} d={d} fill="none" stroke="#0B2A18" strokeWidth={epaisseur + 2.2} strokeLinecap="round" opacity=".55" />
      <path className="inst-dessine" pathLength={100} d={d} fill="none" stroke="url(#inst-tige)" strokeWidth={epaisseur} strokeLinecap="round" />
      <path className="inst-dessine" pathLength={100} d={d} fill="none" stroke="rgba(210,255,228,.55)" strokeWidth=".7" strokeLinecap="round" transform="translate(-.6 -.8)" />
    </>
  );
}

function Vrille({ d }: { d: string }) {
  return <path className="inst-dessine-2" pathLength={100} d={d} fill="none" stroke="#2BB86E" strokeWidth="1.25" strokeLinecap="round" />;
}

const FEUILLES_HAUT: [number, number, number, number][] = [
  [58, 24, -150, 0.9], [74, 38, 30, 0.7], [104, 36, 60, 1], [140, 24, -120, 0.85], [168, 18, -70, 0.75],
  [204, 26, -150, 1.05], [240, 34, 40, 0.8], [270, 40, 80, 0.95], [312, 30, -100, 0.7],
];
const FEUILLES_COTE: [number, number, number, number][] = [
  [44, 300, -20, 1], [22, 276, 200, 0.85], [42, 232, -30, 0.9], [20, 196, 190, 1.05], [36, 150, -10, 0.8],
  [24, 116, 170, 0.95], [40, 92, -40, 0.7],
];
const FEUILLES_SUIVI: [number, number, number, number][] = [
  [54, 24, -150, 0.9], [72, 38, 30, 0.7], [100, 36, 60, 1], [150, 22, -110, 0.85], [186, 24, -150, 1],
  [226, 34, 50, 0.85], [262, 38, 80, 0.9],
];

/** Liane du haut de la fenêtre de choix (avec deux fleurs et deux engrenages). */
export function LianeHautChoix() {
  return (
    <svg aria-hidden="true" className="inst-orne" width="380" height="80" viewBox="0 0 380 80" style={{ left: -24, top: -30 }}>
      <Tige d="M24 30 C 52 12, 86 44, 124 30 S 184 16, 222 30 S 290 42, 326 26 C 344 18, 360 28, 352 38 C 346 44, 338 38, 342 33" epaisseur={2.8} />
      <Vrille d="M124 30 C 118 12, 138 4, 146 14 C 151 21, 143 26, 139 21" />
      <Vrille d="M222 30 C 228 46, 250 48, 252 38 C 253 31, 244 30, 244 35" />
      {FEUILLES_HAUT.map(([x, y, r, s], i) => (
        <Feuille key={i} x={x} y={y} r={r} s={s} i={i} delai={0.7} />
      ))}
      <Fleur x={186} y={19} s={0.9} delai={1.6} />
      <Fleur x={300} y={38} s={0.75} delai={1.9} />
      <EngrenageMetal x={24} y={30} ro={17} ri={13} n={11} />
      <EngrenageMetal x={47} y={52} ro={9.5} ri={7.2} n={7} sens={-1} />
    </svg>
  );
}

/** Liane qui grimpe le long du côté droit de la fenêtre de choix. */
export function LianeCote() {
  return (
    <svg aria-hidden="true" className="inst-orne" width="80" height="360" viewBox="0 0 80 360" style={{ right: -34, bottom: -22 }}>
      <Tige d="M34 338 C 50 306, 18 284, 32 254 S 48 196, 28 168 S 16 104, 34 74 C 42 60, 56 66, 50 76 C 46 82, 40 78, 43 74" epaisseur={2.6} />
      <Vrille d="M32 254 C 12 248, 8 230, 18 226 C 25 223, 28 232, 22 233" />
      <Vrille d="M28 168 C 48 160, 56 144, 48 138 C 42 134, 38 142, 43 145" />
      {FEUILLES_COTE.map(([x, y, r, s], i) => (
        <Feuille key={i} x={x} y={y} r={r} s={s} i={i} delai={0.8} />
      ))}
      <Fleur x={30} y={206} s={0.85} delai={2} />
      <EngrenageMetal x={34} y={338} ro={15} ri={11.5} n={10} sens={-1} />
      <EngrenageMetal x={14} y={316} ro={8.5} ri={6.4} n={7} />
    </svg>
  );
}

/** Liane du haut de la fenêtre de suivi ; des fleurs éclosent quand le jeu est prêt. */
export function LianeHautSuivi({ fleurs }: { fleurs: boolean }) {
  return (
    <svg aria-hidden="true" className="inst-orne" width="340" height="80" viewBox="0 0 340 80" style={{ left: -24, top: -30 }}>
      <Tige d="M24 30 C 50 14, 80 42, 118 30 S 172 18, 206 30 S 256 40, 286 28 C 300 22, 312 32, 304 39 C 298 43, 292 37, 296 33" epaisseur={2.8} />
      <Vrille d="M118 30 C 112 12, 132 4, 140 14 C 145 21, 137 26, 133 21" />
      {FEUILLES_SUIVI.map(([x, y, r, s], i) => (
        <Feuille key={i} x={x} y={y} r={r} s={s} i={i} delai={0.7} />
      ))}
      {fleurs && (
        <>
          <Fleur x={118} y={30} s={1.15} delai={0.1} />
          <Fleur x={206} y={30} delai={0.35} />
          <Fleur x={286} y={28} s={1.1} delai={0.6} />
          <Fleur x={64} y={26} s={0.85} delai={0.8} />
        </>
      )}
      <EngrenageMetal x={24} y={30} ro={17} ri={13} n={11} />
      <EngrenageMetal x={47} y={52} ro={9.5} ri={7.2} n={7} sens={-1} />
    </svg>
  );
}

const LARGEUR_BARRE = 568;
const VERTS = ["#3FE08A", "#2BB86E", "#7DFFB6", "#1E9E58"];

function vague(): string {
  let d = "M0 22";
  for (let x = 0; x < LARGEUR_BARRE; x += 71) {
    d += ` C ${x + 18} 10, ${x + 35} 10, ${x + 35.5} 22 S ${x + 53} 34, ${x + 71} 22`;
  }
  return d;
}
const VAGUE = vague();

/**
 * Barre de progression en liane : la tige pousse jusqu'au pourcentage, les feuilles
 * apparaissent à son passage, un engrenage tourne à la pointe. `inconnu` : attente
 * (la tête respire sur place).
 */
export function BarreLiane({ fraction, inconnu, arret }: { fraction: number; inconnu: boolean; arret: boolean }) {
  const p = Math.max(0, Math.min(1, fraction)) * 100;
  const decalage = (100 - p).toFixed(2);
  return (
    <div className={`inst-barre${arret ? " is-arret" : ""}${inconnu ? " is-inconnu" : ""}`}>
      <div className="inst-barre__rail" aria-hidden="true" />
      <svg aria-hidden="true" width={LARGEUR_BARRE} height="44" viewBox={`0 0 ${LARGEUR_BARRE} 44`} className="inst-barre__svg">
        <path pathLength={100} d={VAGUE} fill="none" stroke="#0B2A18" strokeWidth="5.4" strokeLinecap="round" strokeDasharray="100" strokeDashoffset={decalage} opacity=".6" className="inst-barre__trait" />
        <path pathLength={100} d={VAGUE} fill="none" stroke="url(#inst-barre)" strokeWidth="3" strokeLinecap="round" strokeDasharray="100" strokeDashoffset={decalage} className="inst-barre__trait inst-barre__lueur" />
        {[40, 100, 160, 220, 280, 340, 400, 460, 520].map((x, i) =>
          p >= (x / LARGEUR_BARRE) * 100 + 1 ? (
            <g key={x} transform={`translate(${x} ${i % 2 ? 26 : 18}) rotate(${i % 2 ? 40 : -140})`}>
              <path className="inst-feuille" d="M0 0 C 4 -7 13 -8 18 -2 C 13 5 4 5 0 0 Z" fill={VERTS[i % 4]} />
              <path className="inst-feuille" d="M1 -.5 L 16 -2" stroke="rgba(6,30,16,.55)" strokeWidth=".7" fill="none" />
            </g>
          ) : null,
        )}
      </svg>
      <div className="inst-barre__tete" style={{ left: `${(p / 100) * LARGEUR_BARRE}px` }} aria-hidden="true">
        <svg width="40" height="40" viewBox="-20 -20 40 40" className="inst-barre__gros">
          <g className="inst-spin-vite">
            <path d={engrenage(13, 10, 9)} fill="url(#inst-metal)" stroke="#7DFFB6" strokeWidth="1" />
            <circle r="7" fill="#16191B" />
            <circle r="4.6" fill="none" stroke="url(#inst-metal)" strokeWidth="3.4" strokeDasharray="2.2 4" />
          </g>
          <circle r="3.4" fill="#22272A" stroke="#3FE08A" strokeWidth="1.8" />
        </svg>
        <svg width="26" height="26" viewBox="-13 -13 26 26" className="inst-barre__petit">
          <g className="inst-spin-vite-r">
            <path d={engrenage(8, 6, 6)} fill="#2C3134" stroke="#5A6266" strokeWidth="1" />
          </g>
          <circle r="2.6" fill="#141617" stroke="#3FE08A" strokeWidth="1.3" />
        </svg>
      </div>
    </div>
  );
}

/** Petit engrenage de disque (tourne quand le disque est choisi). */
export function EngrenageDisque({ actif }: { actif: boolean }) {
  return (
    <svg aria-hidden="true" width="26" height="26" viewBox="-13 -13 26 26">
      <g className={actif ? "inst-spin" : ""}>
        <path d={engrenage(12, 9.2, 8)} fill={actif ? "#2C3134" : "#202325"} stroke={actif ? "#7DFFB6" : "#3A4044"} strokeWidth="1" />
      </g>
      <circle r="3.4" fill="#141617" stroke={actif ? "#3FE08A" : "#3A4044"} strokeWidth="1.6" />
    </svg>
  );
}

/** Engrenage de la pastille réduite, entouré de l'anneau de progression. */
export function AnneauProgression({ fraction }: { fraction: number }) {
  const p = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <svg aria-hidden="true" width="52" height="52" viewBox="-26 -26 52 52">
      <circle r="22" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="4" />
      <circle
        r="22"
        fill="none"
        stroke="#3FE08A"
        strokeWidth="4"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={`${p.toFixed(1)} 100`}
        transform="rotate(-90)"
        style={{ filter: "drop-shadow(0 0 4px rgba(63,224,138,.6))", transition: "stroke-dasharray 1.8s linear" }}
      />
      <g className="inst-spin-vite">
        <path d={engrenage(10, 7.6, 7)} fill="#2C3134" stroke="#7DFFB6" strokeWidth="1" />
      </g>
      <circle r="3.4" fill="#141617" stroke="#3FE08A" strokeWidth="1.5" />
    </svg>
  );
}
