import { useEffect, useMemo, useRef, useState, type PointerEvent as PE } from "react";
import type { JeuBibliotheque, StatsSysteme } from "../../api/types";
import { useImages } from "../../api/requetes";
import { Courbe } from "../../components/Courbe";
import { useInstallation } from "../../installation/store";
import { taille } from "../../lib/format";
import { degradeJaquette, imagesDe } from "../../lib/images";
import { debit } from "../../lib/telechargement";

/** 90 relevés de 2 s : les 3 dernières minutes. */
const NB_RELEVES = 90;
const DEBIT_MAX = 5_000_000_000;

/** Débits réseau et disque (écriture de Steam) relevés toutes les 2 s, gardés en mémoire. */
export function useHistoriqueDebits(stats: StatsSysteme | undefined) {
  const precedent = useRef<StatsSysteme | null>(null);
  const [reseau, setReseau] = useState<(number | null)[]>(() => Array(NB_RELEVES).fill(null));
  const [disque, setDisque] = useState<(number | null)[]>(() => Array(NB_RELEVES).fill(null));
  useEffect(() => {
    if (!stats) return;
    const p = precedent.current;
    precedent.current = stats;
    if (!p || stats.horodatageMs <= p.horodatageMs) return;
    const dt = (stats.horodatageMs - p.horodatageMs) / 1000;
    const r = (stats.reseauRecu - p.reseauRecu) / dt;
    const d = stats.steamEcrit != null && p.steamEcrit != null ? (stats.steamEcrit - p.steamEcrit) / dt : null;
    const ok = (v: number | null) => (v != null && v >= 0 && v < DEBIT_MAX ? v : null);
    setReseau((l) => [...l.slice(1), ok(r)]);
    setDisque((l) => [...l.slice(1), ok(d)]);
  }, [stats]);
  return { reseau, disque };
}

function resume(valeurs: (number | null)[]) {
  const v = valeurs.filter((x): x is number => x != null);
  if (v.length === 0) return null;
  return { maintenant: v[v.length - 1], moyenne: v.reduce((s, x) => s + x, 0) / v.length, pic: Math.max(...v) };
}

/** Carte d'un graphique : titre, valeur actuelle, moyenne, pic, courbe vivante. */
export function CarteDebit({ titre, valeurs, couleur, note }: { titre: string; valeurs: (number | null)[]; couleur: string; note?: string }) {
  const r = resume(valeurs);
  return (
    <div className="dl-graphe" data-lueur="" style={{ "--teinte": couleur } as React.CSSProperties}>
      <div className="dl-graphe__haut">
        <span className="dl-graphe__titre">{titre}</span>
        <strong className="dl-graphe__valeur">{r ? debit(r.maintenant) : "—"}</strong>
      </div>
      <Courbe valeurs={valeurs} couleur={couleur} hauteur={120} attente="Relevé toutes les 2 secondes…" />
      <div className="dl-graphe__bas">
        <span>
          moyenne <strong>{r ? debit(r.moyenne) : "—"}</strong>
        </span>
        <span>
          pic <strong>{r ? debit(r.pic) : "—"}</strong>
        </span>
        {note && <span className="dl-graphe__note">{note}</span>}
      </div>
    </div>
  );
}

/**
 * « Installer un jeu » (demande de Tom) : chercher un jeu de la bibliothèque qui
 * n'est pas installé, puis le glisser dans la zone — la fenêtre d'installation
 * arrive et Steam télécharge. Glisser à la souris (pointeur), sans le glisser-déposer
 * du navigateur, que la fenêtre Tauri réserve aux fichiers.
 */
export function GlisserInstaller({ jeux }: { jeux: JeuBibliotheque[] }) {
  const ouvrirChoix = useInstallation((s) => s.ouvrirChoix);
  const [recherche, setRecherche] = useState("");
  const zone = useRef<HTMLDivElement>(null);
  const [glisse, setGlisse] = useState<{ jeu: JeuBibliotheque; x: number; y: number } | null>(null);
  const [dessus, setDessus] = useState(false);
  const [aspire, setAspire] = useState<JeuBibliotheque | null>(null);

  const liste = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const l = jeux.filter((j) => !j.installation && !j.cache && (!q || j.nom.toLowerCase().includes(q)));
    return l.sort((a, b) => b.minutesTotal - a.minutesTotal).slice(0, 14);
  }, [jeux, recherche]);
  const images = useImages(liste.map((j) => j.appId));

  const lancer = (jeu: JeuBibliotheque) => {
    const im = imagesDe(jeu.appId, images.data);
    setAspire(jeu);
    window.setTimeout(() => {
      setAspire(null);
      ouvrirChoix({ appId: jeu.appId, nom: jeu.nom, jaquette: im.jaquette, hero: im.hero });
    }, 520);
  };

  const commencer = (e: PE<HTMLButtonElement>, jeu: JeuBibliotheque) => {
    if (e.button !== 0) return;
    const depart = { x: e.clientX, y: e.clientY };
    let enCours = false;
    const dansZone = (x: number, y: number) => {
      const r = zone.current?.getBoundingClientRect();
      return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    const bouge = (ev: PointerEvent) => {
      if (!enCours && Math.hypot(ev.clientX - depart.x, ev.clientY - depart.y) < 6) return;
      enCours = true;
      setGlisse({ jeu, x: ev.clientX, y: ev.clientY });
      setDessus(dansZone(ev.clientX, ev.clientY));
    };
    const fin = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", bouge);
      window.removeEventListener("pointerup", fin);
      setGlisse(null);
      setDessus(false);
      if (enCours && dansZone(ev.clientX, ev.clientY)) lancer(jeu);
    };
    window.addEventListener("pointermove", bouge);
    window.addEventListener("pointerup", fin);
  };

  const jaquetteDe = (j: JeuBibliotheque) => imagesDe(j.appId, images.data).jaquettePetite;

  return (
    <div className="dl-installer">
      <div className="dl-installer__gauche">
        <label className="biblio__recherche dl-installer__recherche">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <span className="sr-only">Chercher un jeu à installer</span>
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Chercher un jeu à installer" spellCheck={false} />
        </label>
        <div className="dl-installer__jeux">
          {liste.length === 0 && <p className="secondaire__note">{recherche ? "Aucun jeu non installé ne correspond." : "Tous tes jeux sont installés !"}</p>}
          {liste.map((j, i) => {
            const url = jaquetteDe(j);
            return (
              <button
                key={j.appId}
                type="button"
                className={`dl-jeu${glisse?.jeu.appId === j.appId ? " is-souleve" : ""}`}
                onPointerDown={(e) => commencer(e, j)}
                onDoubleClick={() => lancer(j)}
                title={`${j.nom} : glisse-le dans la zone, ou double-clique`}
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <span className="dl-jeu__art" style={url ? { backgroundImage: `url("${url}")` } : { background: degradeJaquette(j.nom) }} />
                <span className="dl-jeu__nom">{j.nom}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div ref={zone} className={`dl-zone${glisse ? " is-attente" : ""}${dessus ? " is-dessus" : ""}${aspire ? " is-aspire" : ""}`}>
        <span className="dl-zone__anneau" aria-hidden="true" />
        <svg className="dl-zone__fleche" width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M12 3v12M7 10l5 5 5-5" />
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
        <strong>{aspire ? `${aspire.nom} : c’est parti` : dessus ? "Lâche pour installer" : "Glisse un jeu ici"}</strong>
        <span>La fenêtre d’installation s’ouvre, puis Steam télécharge en arrière-plan.</span>
      </div>

      {glisse && (
        <span
          className="dl-fantome"
          style={{
            left: glisse.x,
            top: glisse.y,
            backgroundImage: jaquetteDe(glisse.jeu) ? `url("${jaquetteDe(glisse.jeu)}")` : undefined,
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

/** Petites infos qui occupent l'espace sans le remplir bêtement. */
export function InfosDisques({ jeux, stats }: { jeux: { bibliotheque: string; taille: number }[]; stats: StatsSysteme | undefined }) {
  const total = jeux.reduce((s, j) => s + j.taille, 0);
  const libre = (stats?.disques ?? []).reduce((s, d) => s + d.libre, 0);
  const plusGros = [...jeux].sort((a, b) => b.taille - a.taille)[0];
  return (
    <div className="dl-infos">
      <div>
        <strong>{taille(total)}</strong>
        <span>de jeux installés</span>
      </div>
      <div>
        <strong>{libre ? taille(libre) : "—"}</strong>
        <span>libres sur tes disques</span>
      </div>
      <div>
        <strong>{jeux.length}</strong>
        <span>jeux sur ce PC</span>
      </div>
      {plusGros && (
        <div>
          <strong>{taille(plusGros.taille)}</strong>
          <span>le plus gros jeu</span>
        </div>
      )}
    </div>
  );
}
