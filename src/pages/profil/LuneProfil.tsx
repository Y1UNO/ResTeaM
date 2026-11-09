import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LuneCeleste } from "../../components/LuneCeleste";
import { entier } from "../../lib/format";
import { NIVEAU_MAX, SEUILS, nouveauteDuNiveau, type NiveauLune, type Points } from "../../lib/niveauResteam";
import "./LuneProfil.css";

const CLE_NIVEAU_VU = "resteam-niveau-lune";

/**
 * Lune du profil : le niveau ResTeaM (1 à 30) dans le creux, le niveau Steam en petit.
 * Un clic ouvre l'aperçu des 30 lunes. Pour mon profil, un niveau gagné depuis la
 * dernière visite déclenche l'écran « Niveau supérieur ! ».
 */
export function LuneProfil({
  lune,
  points,
  niveauSteam,
  moi,
  pluie,
}: {
  lune: NiveauLune;
  points: Points;
  niveauSteam: number | null;
  moi: boolean;
  pluie: boolean;
}) {
  const [apercu, setApercu] = useState(false);
  const [fete, setFete] = useState<number | null>(null);

  useEffect(() => {
    if (!moi) return;
    let vu = 0;
    try {
      vu = Number(localStorage.getItem(CLE_NIVEAU_VU) ?? 0);
      localStorage.setItem(CLE_NIVEAU_VU, String(lune.niveau));
    } catch {
      return;
    }
    // Première visite : on retient le niveau sans fête.
    if (vu > 0 && lune.niveau > vu) setFete(lune.niveau);
  }, [moi, lune.niveau]);

  return (
    <>
      <button
        type="button"
        className="lune-profil"
        onClick={() => setApercu(true)}
        title={`Niveau ResTeaM ${lune.niveau}${lune.reste ? ` · encore ${entier(lune.reste)} points pour le niveau ${lune.niveau + 1}` : " · niveau maximum"}${niveauSteam != null ? ` · niveau Steam ${niveauSteam}` : ""}`}
        aria-label={`Niveau ResTeaM ${lune.niveau}, voir les 30 lunes`}
      >
        {pluie && <Pluie />}
        <LuneCeleste
          niveau={lune.niveau}
          fraction={lune.fraction}
          texte={
            <>
              <strong>{lune.niveau}</strong>
              <span>NIVEAU</span>
            </>
          }
        />
        {niveauSteam != null && <span className="lune-profil__steam">Steam {niveauSteam}</span>}
      </button>
      {apercu && <ApercuLunes lune={lune} points={points} onFermer={() => setApercu(false)} />}
      {fete != null && <NiveauSuperieur niveau={fete} onFermer={() => setFete(null)} />}
    </>
  );
}

const GOUTTES = [
  { left: 8, delai: 0, duree: 2.4 },
  { left: 17, delai: 0.9, duree: 2.9 },
  { left: 25, delai: 0.3, duree: 2.2 },
  { left: 33, delai: 1.6, duree: 2.7 },
  { left: 41, delai: 0.6, duree: 2.5 },
  { left: 49, delai: 1.2, duree: 3.1 },
  { left: 56, delai: 2, duree: 2.3 },
  { left: 21, delai: 1.4, duree: 3.4, point: true },
  { left: 45, delai: 0.2, duree: 3.6, point: true },
];

function Pluie() {
  return (
    <div className="lune-niveau__pluie" aria-hidden="true">
      {GOUTTES.map((g, i) => (
        <span key={i} className={`lune-niveau__goutte${g.point ? " is-point" : ""}`} style={{ left: g.left, animationDelay: `${g.delai}s`, animationDuration: `${g.duree}s` }} />
      ))}
    </div>
  );
}

function useEchap(fermer: () => void) {
  useEffect(() => {
    const t = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, [fermer]);
}

/** Les 30 lunes, avec les points qui manquent pour la suivante. */
function ApercuLunes({ lune, points, onFermer }: { lune: NiveauLune; points: Points; onFermer: () => void }) {
  const [sortie, setSortie] = useState(false);
  const fermer = () => {
    setSortie(true);
    window.setTimeout(onFermer, 320);
  };
  useEchap(fermer);
  return createPortal(
    <>
      <div className={`achat__voile ${sortie ? "is-sortie" : ""}`} onClick={fermer} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="lunes-titre" className={`lunes ${sortie ? "is-sortie" : ""}`}>
        <header className="lunes__entete">
          <LuneCeleste niveau={lune.niveau} fraction={lune.fraction} taille={72} />
          <div>
            <h2 id="lunes-titre">Ta lune · niveau {lune.niveau}</h2>
            <p>
              {lune.reste ? `Encore ${entier(lune.reste)} points pour le niveau ${lune.niveau + 1}.` : "Niveau maximum : la lune céleste."} {entier(points.total)} points en tout.
            </p>
            <ul className="lunes__points">
              <li>
                <strong>{entier(points.trophees)}</strong> trophées
              </li>
              <li>
                <strong>{entier(points.heures)}</strong> heures de jeu
              </li>
              <li>
                <strong>{entier(points.complets)}</strong> jeux à 100 %
              </li>
              <li>
                <strong>{entier(points.rangs)}</strong> rangs
              </li>
            </ul>
          </div>
          <button type="button" className="lunes__fermer" aria-label="Fermer" onClick={fermer} autoFocus>
            ×
          </button>
        </header>
        <ol className="lunes__grille">
          {Array.from({ length: NIVEAU_MAX }, (_, i) => {
            const n = i + 1;
            const atteint = n <= lune.niveau;
            const palier = n % 5 === 0 || n === 1;
            return (
              <li key={n} className={`lunes__case${atteint ? " is-atteint" : ""}${n === lune.niveau ? " is-actuel" : ""}${palier ? " is-palier" : ""}`}>
                <LuneCeleste niveau={n} taille={56} />
                <strong>{n}</strong>
                <span className="lunes__detail">{nouveauteDuNiveau(n)}</span>
                <span className="lunes__seuil">{atteint ? "Atteint" : `${entier(SEUILS[i])} pts`}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </>,
    document.body,
  );
}

/** Écran « Niveau supérieur ! » : la nouvelle lune grandit au centre, puis tout s'efface. */
function NiveauSuperieur({ niveau, onFermer }: { niveau: number; onFermer: () => void }) {
  useEchap(onFermer);
  useEffect(() => {
    const t = window.setTimeout(onFermer, 5200);
    return () => window.clearTimeout(t);
  }, [onFermer]);
  return createPortal(
    <div className="niveau-sup" role="status" onClick={onFermer}>
      <div className="niveau-sup__rayons" aria-hidden="true" />
      <div className="niveau-sup__lune">
        <LuneCeleste niveau={niveau} taille={180} />
      </div>
      <p className="niveau-sup__titre">Niveau supérieur !</p>
      <p className="niveau-sup__niveau">
        Niveau {niveau} · {nouveauteDuNiveau(niveau)}
      </p>
    </div>,
    document.body,
  );
}
