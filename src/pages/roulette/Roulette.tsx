import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/commandes";
import { useBibliotheque, useBilanTrophees, useImages } from "../../api/requetes";
import type { JeuBibliotheque } from "../../api/types";
import { heures } from "../../lib/format";
import { degradeJaquette, imagesDe, replierJaquette } from "../../lib/images";
import "./roulette.css";

type Filtre = "installes" | "favoris" | "jamais" | "pasFinis";
const FILTRES: [Filtre, string][] = [
  ["installes", "Installés"],
  ["favoris", "Favoris"],
  ["jamais", "Jamais lancés"],
  ["pasFinis", "Pas finis à 100 %"],
];

/** Largeur d'une jaquette + écart, en pixels (voir roulette.css). */
const PAS = 152;
const TAILLE_BANDE = 56;
const INDEX_GAGNANT = 48;
const DUREE_MS = 6200;

function auHasard(n: number): number {
  const t = new Uint32Array(1);
  crypto.getRandomValues(t);
  return t[0] % n;
}

const jouable = (j: JeuBibliotheque) => j.installation?.etat === "installe" || j.installation?.etat === "miseAJourRequise";

/** Bouton qui ouvre la roulette (Bibliothèque, accueil). */
export function BoutonRoulette({ compact = false }: { compact?: boolean }) {
  const [ouverte, setOuverte] = useState(false);
  return (
    <>
      <button type="button" className={`btn-roulette${compact ? " is-compact" : ""}`} onClick={() => setOuverte(true)} title="Tirer au sort un jeu pour ce soir">
        <IconeRoue />
        <span>Ce soir je joue à…</span>
      </button>
      {ouverte && <Roulette onFermer={() => setOuverte(false)} />}
    </>
  );
}

/** Segments de la roue dans la DA « clair de lune » : argent, charbon, bleu lunaire. */
const SEGMENTS = ["#eef2ff", "#1c1f26", "#9fd8ff", "#1c1f26", "#cfd8f0", "#1c1f26", "#9fd8ff", "#1c1f26"];

/** Part de camembert de la roue (SVG), de l'angle a à l'angle b (degrés). */
function part(a: number, b: number, r: number) {
  const p = (d: number) => [50 + r * Math.cos(((d - 90) * Math.PI) / 180), 50 + r * Math.sin(((d - 90) * Math.PI) / 180)];
  const [x1, y1] = p(a);
  const [x2, y2] = p(b);
  return `M50 50 L${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

/**
 * La roue de l'accueil (en haut à gauche, demande de Tom) : une petite roue de casino
 * qui tourne doucement, ses lumières qui clignotent en chaîne, une lune au centre.
 * Un clic ouvre la roulette.
 */
export function RoueAccueil() {
  const [ouverte, setOuverte] = useState(false);
  return (
    <>
      <button type="button" className="roue-accueil" onClick={() => setOuverte(true)} title="Tirer au sort un jeu pour ce soir">
        <span className="roue-accueil__roue" aria-hidden="true">
          <svg className="roue-accueil__disque" viewBox="0 0 100 100" width="76" height="76">
            <defs>
              <radialGradient id="roue-reflet" cx="40%" cy="35%" r="70%">
                <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
                <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
              </radialGradient>
            </defs>
            {SEGMENTS.map((c, i) => (
              <path key={i} d={part(i * 45, (i + 1) * 45, 44)} fill={c} fillOpacity={i % 2 ? 1 : 0.88} stroke="#0e0e11" strokeWidth="1.2" />
            ))}
            <circle cx="50" cy="50" r="44" fill="url(#roue-reflet)" />
            <circle cx="50" cy="50" r="46" fill="none" stroke="#eef2ff" strokeWidth="2.5" />
          </svg>
          <span className="roue-accueil__lumieres">
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i} style={{ transform: `rotate(${i * 30}deg) translateY(-40px)`, animationDelay: `${(i % 12) * 0.1}s` }} />
            ))}
          </span>
          <span className="roue-accueil__centre">
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path d="M14.5 3.2a8.6 8.6 0 1 0 6.3 12.6 7 7 0 1 1-6.3-12.6z" fill="#eef2ff" />
            </svg>
          </span>
          <span className="roue-accueil__fleche" />
        </span>
        <span className="roue-accueil__texte">
          <span className="roue-accueil__kicker">La roue du soir</span>
          <strong>Ce soir je joue à…</strong>
          <span>Laisse la lune choisir</span>
        </span>
      </button>
      {ouverte && <Roulette onFermer={() => setOuverte(false)} />}
    </>
  );
}

/**
 * Roulette « Ce soir je joue à… » (idée de Tom, avec un côté « gambling ») : une bande
 * de jaquettes défile vite puis ralentit sous le repère lunaire, et s'arrête sur le jeu
 * tiré au sort parmi ceux qui passent les filtres. Le tirage est fait avant le départ
 * (hasard du navigateur), la bande ne fait que le mettre en scène.
 */
export function Roulette({ onFermer, filtresInitiaux = ["installes"] }: { onFermer: () => void; filtresInitiaux?: Filtre[] }) {
  const navigate = useNavigate();
  const biblio = useBibliotheque();
  const bilan = useBilanTrophees(null);
  const [filtres, setFiltres] = useState<Set<Filtre>>(() => new Set<Filtre>(filtresInitiaux));
  const [etat, setEtat] = useState<"pret" | "tourne" | "fini">("pret");
  const [bande, setBande] = useState<JeuBibliotheque[]>([]);
  const [decalage, setDecalage] = useState(0);
  const [anime, setAnime] = useState(false);
  const [sortie, setSortie] = useState(false);
  const fenetre = useRef<HTMLDivElement>(null);

  const complets = useMemo(() => new Set(bilan.data?.donnees.complets ?? []), [bilan.data]);
  const reserve = useMemo(() => {
    const jeux = (biblio.data?.donnees.jeux ?? []).filter((j) => !j.cache);
    return jeux.filter(
      (j) =>
        (!filtres.has("installes") || jouable(j)) &&
        (!filtres.has("favoris") || j.favori) &&
        (!filtres.has("jamais") || j.minutesTotal === 0) &&
        (!filtres.has("pasFinis") || (j.minutesTotal > 0 && !complets.has(j.appId))),
    );
  }, [biblio.data, filtres, complets]);

  // Bande au repos : des jaquettes de la réserve, la roue « attend ».
  useEffect(() => {
    if (etat === "tourne" || !reserve.length) return;
    if (etat === "fini") return;
    setBande(Array.from({ length: 9 }, () => reserve[auHasard(reserve.length)]));
    setAnime(false);
    setDecalage(centrer(4));
  }, [reserve, etat]);

  const ids = useMemo(() => [...new Set(bande.map((j) => j.appId))], [bande]);
  const images = useImages(ids);
  const gagnant = etat === "fini" ? bande[INDEX_GAGNANT] : null;

  const centrer = (index: number) => {
    const largeur = fenetre.current?.clientWidth ?? 900;
    return -(index * PAS + PAS / 2 - largeur / 2);
  };

  const lancer = () => {
    if (!reserve.length || etat === "tourne") return;
    const g = reserve[auHasard(reserve.length)];
    const nouvelle = Array.from({ length: TAILLE_BANDE }, () => reserve[auHasard(reserve.length)]);
    nouvelle[INDEX_GAGNANT] = g;
    // Les voisins du gagnant diffèrent de lui, pour que l'arrêt fasse vibrer.
    for (const i of [INDEX_GAGNANT - 1, INDEX_GAGNANT + 1]) {
      if (reserve.length > 1) while (nouvelle[i].appId === g.appId) nouvelle[i] = reserve[auHasard(reserve.length)];
    }
    setBande(nouvelle);
    setEtat("tourne");
    setAnime(false);
    setDecalage(centrer(2));
    // Deux images plus tard, la bande part (transition en transform uniquement).
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setAnime(true);
        // L'arrêt tombe quelque part sur la jaquette, pas pile au centre.
        setDecalage(centrer(INDEX_GAGNANT) + (auHasard(81) - 40));
      }),
    );
  };

  const fermer = () => {
    setSortie(true);
    window.setTimeout(onFermer, 320);
  };
  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  });

  const basculer = (f: Filtre) => {
    if (etat === "tourne") return;
    setEtat("pret");
    setFiltres((x) => {
      const n = new Set(x);
      if (n.has(f)) n.delete(f);
      else n.add(f);
      // « Jamais lancés » et « pas finis » s'excluent.
      if (f === "jamais") n.delete("pasFinis");
      if (f === "pasFinis") n.delete("jamais");
      return n;
    });
  };

  return createPortal(
    <>
      <div className={`achat__voile ${sortie ? "is-sortie" : ""}`} onClick={fermer} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="roulette-titre" className={`roulette is-${etat}${sortie ? " is-sortie" : ""}`}>
        <header className="roulette__entete">
          <span className="roulette__icone" aria-hidden="true">
            <IconeRoue />
          </span>
          <div>
            <h2 id="roulette-titre">Ce soir je joue à…</h2>
            <p>{reserve.length ? `${reserve.length} jeu${reserve.length > 1 ? "x" : ""} dans la roue` : "Aucun jeu ne passe ces filtres"}</p>
          </div>
          <button type="button" className="lunes__fermer roulette__fermer" aria-label="Fermer" onClick={fermer}>
            ×
          </button>
        </header>

        <div className="roulette__filtres" role="group" aria-label="Filtres">
          {FILTRES.map(([f, libelle]) => (
            <button key={f} type="button" aria-pressed={filtres.has(f)} className={`roulette__filtre${filtres.has(f) ? " is-actif" : ""}`} disabled={etat === "tourne"} onClick={() => basculer(f)}>
              {libelle}
            </button>
          ))}
        </div>

        <div className="roulette__fenetre" ref={fenetre}>
          <div
            className="roulette__bande"
            style={{
              transform: `translateX(${decalage}px)`,
              transition: anime ? `transform ${DUREE_MS}ms cubic-bezier(0.06, 0.78, 0.13, 1)` : "none",
            }}
            onTransitionEnd={() => {
              if (etat === "tourne") setEtat("fini");
            }}
          >
            {bande.map((j, i) => {
              const im = imagesDe(j.appId, images.data);
              return (
                <div key={i} className={`roulette__jeu${gagnant && i === INDEX_GAGNANT ? " is-gagnant" : ""}`} style={im.jaquette ? undefined : { background: degradeJaquette(j.nom) }}>
                  {im.jaquette && <img src={im.jaquette} alt="" draggable={false} onError={(e) => replierJaquette(e.currentTarget)} />}
                  <span>{j.nom}</span>
                </div>
              );
            })}
          </div>
          <span className="roulette__repere" aria-hidden="true">
            <span className="roulette__lune is-haut" />
            <span className="roulette__trait" />
            <span className="roulette__lune is-bas" />
          </span>
          {gagnant && (
            <span className="roulette__gerbe" aria-hidden="true">
              {Array.from({ length: 14 }, (_, i) => (
                <span key={i} style={{ transform: `rotate(${(360 / 14) * i}deg)`, animationDelay: `${(i % 3) * 60}ms` }} />
              ))}
            </span>
          )}
        </div>

        <div className="roulette__resultat" aria-live="polite">
          {gagnant ? (
            <>
              <span className="roulette__kicker">Ce soir, ce sera…</span>
              <strong>{gagnant.nom}</strong>
              <span className="roulette__infos">
                {gagnant.minutesTotal ? `${heures(gagnant.minutesTotal)} déjà jouées` : "Jamais lancé : une découverte !"}
                {jouable(gagnant) ? " · installé" : " · pas installé"}
              </span>
              <div className="roulette__boutons">
                {jouable(gagnant) ? (
                  <button
                    type="button"
                    className="btn btn--principal btn--petit"
                    onClick={() => {
                      void api.steamLien({ type: "jouer", appId: gagnant.appId });
                      fermer();
                    }}
                  >
                    Jouer
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn--secondaire btn--petit"
                  onClick={() => {
                    fermer();
                    navigate(`/jeu/${gagnant.appId}`);
                  }}
                >
                  {jouable(gagnant) ? "Voir la fiche" : "L’installer"}
                </button>
                <button type="button" className="btn btn--lien" onClick={lancer}>
                  Relancer la roue
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="btn btn--principal roulette__lancer" disabled={!reserve.length || etat === "tourne"} onClick={lancer}>
              {etat === "tourne" ? "La lune tourne…" : "Lancer la roue"}
            </button>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

/** Une roue de fortune avec un croissant au centre. */
function IconeRoue() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v3.2M12 17.8V21M3 12h3.2M17.8 12H21M5.6 5.6l2.3 2.3M16.1 16.1l2.3 2.3M5.6 18.4l2.3-2.3M16.1 7.9l2.3-2.3" strokeWidth="1.3" opacity="0.7" />
      <path d="M12.9 9.6a2.6 2.6 0 1 0 1.8 4 2.1 2.1 0 1 1-1.8-4z" fill="currentColor" stroke="none" />
    </svg>
  );
}
