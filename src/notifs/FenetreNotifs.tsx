import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, dansTauri } from "../api/commandes";
import type { Notif } from "../api/types";
import { viaCache } from "../lib/imageLocale";
import { replierJaquette } from "../lib/images";
import "./notifs.css";

const MAX_VISIBLES = 4;
const LIBELLES: Record<string, string> = {
  ami: "Ami en jeu",
  telechargement: "Prêt à jouer",
  maj: "Mise à jour",
  promo: "Promo",
  resteam: "ResTeaM",
};

type Affichee = Notif & { sortie?: boolean };

/**
 * Fenêtre des notifications (idée de Tom) : des cartes dans la DA, au lieu des
 * notifications fades de Windows. Elles glissent depuis le bord, se rangent en pile,
 * restent tant que la souris est dessus, et s'en vont seules. La fenêtre prend la
 * hauteur des cartes (Rust la place dans le coin choisi) et se cache quand il n'y a plus rien.
 */
export function FenetreNotifs() {
  const [liste, setListe] = useState<Affichee[]>([]);
  const [reglages, setReglages] = useState({ duree: 7, coin: "bd" });
  const pile = useRef<HTMLDivElement>(null);

  const prendre = useCallback(async () => {
    try {
      const r = await api.notifsPrendre();
      setReglages({ duree: r.duree, coin: r.coin });
      if (r.notifs.length) setListe((l) => [...l, ...r.notifs]);
    } catch {
      /* rien à afficher */
    }
  }, []);

  useEffect(() => {
    void prendre();
    if (!dansTauri) return;
    let stop: (() => void) | undefined;
    listen("notifs-nouvelles", () => void prendre())
      .then((u) => (stop = u))
      .catch(() => {});
    return () => stop?.();
  }, [prendre]);

  const fermer = useCallback((id: number) => {
    setListe((l) => l.map((n) => (n.id === id ? { ...n, sortie: true } : n)));
    window.setTimeout(() => setListe((l) => l.filter((n) => n.id !== id)), 420);
  }, []);

  // La fenêtre suit la hauteur de la pile (0 : cachée).
  useLayoutEffect(() => {
    const el = pile.current;
    if (!el) return;
    const envoyer = () => void api.notifsTaille(liste.length ? Math.ceil(el.getBoundingClientRect().height) + 4 : 0).catch(() => {});
    envoyer();
    const obs = new ResizeObserver(envoyer);
    obs.observe(el);
    return () => obs.disconnect();
  }, [liste.length]);

  const haut = reglages.coin.startsWith("h");
  const gauche = reglages.coin.endsWith("g");
  const visibles = liste.slice(0, MAX_VISIBLES);
  return (
    <div ref={pile} className={`notifs${haut ? " is-haut" : ""}${gauche ? " is-gauche" : ""}`}>
      {/* La plus récente au plus près du coin. */}
      {(haut ? [...visibles].reverse() : visibles).map((n) => (
        <Carte key={n.id} n={n} duree={reglages.duree} gauche={gauche} onFermer={() => fermer(n.id)} />
      ))}
      {liste.length > MAX_VISIBLES && <div className="notifs__plus">+{liste.length - MAX_VISIBLES} autres</div>}
    </div>
  );
}

function Carte({ n, duree, gauche, onFermer }: { n: Affichee; duree: number; gauche: boolean; onFermer: () => void }) {
  const [survol, setSurvol] = useState(false);
  const reste = useRef(duree * 1000);
  const debut = useRef(Date.now());

  // Minuteur qui s'arrête au survol et reprend ensuite.
  useEffect(() => {
    if (n.sortie) return;
    if (survol) {
      reste.current -= Date.now() - debut.current;
      return;
    }
    debut.current = Date.now();
    const t = window.setTimeout(onFermer, Math.max(400, reste.current));
    return () => window.clearTimeout(t);
  }, [survol, n.sortie, onFermer]);

  const ouvrir = () => {
    if (!n.page) return;
    void api.notifsClic(n.page, null).catch(() => {});
    onFermer();
  };
  const ronde = n.genre === "ami";
  return (
    <div
      className={`carte-notif genre-${n.genre}${n.sortie ? " is-sortie" : ""}${gauche ? " depuis-gauche" : ""}${n.page ? " is-cliquable" : ""}`}
      onMouseEnter={() => setSurvol(true)}
      onMouseLeave={() => setSurvol(false)}
      onClick={ouvrir}
      role="status"
    >
      {n.image && <img className="carte-notif__fond" src={viaCache(n.image)} alt="" draggable={false} />}
      <span className="carte-notif__voile" aria-hidden="true" />
      <span className="carte-notif__halo" aria-hidden="true" />
      <div className="carte-notif__contenu">
        <div className={`carte-notif__vignette${ronde ? " is-ronde" : ""}${!n.vignette ? " is-lune" : ""}`}>
          {n.vignette ? (
            <img src={viaCache(n.vignette)} alt="" draggable={false} onError={(e) => replierJaquette(e.currentTarget)} />
          ) : (
            <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
              <path d="M14.5 3.2a8.6 8.6 0 1 0 6.3 12.6 7 7 0 1 1-6.3-12.6z" fill="#eef2ff" />
            </svg>
          )}
          {n.cadre && <img className="carte-notif__cadre" src={viaCache(n.cadre)} alt="" draggable={false} />}
          {ronde && <span className="carte-notif__en-jeu" aria-hidden="true" />}
        </div>
        <div className="carte-notif__texte">
          <span className="carte-notif__genre">
            <span className="carte-notif__lune" aria-hidden="true" />
            {LIBELLES[n.genre] ?? "ResTeaM"}
          </span>
          <strong>{n.titre}</strong>
          <span>{n.texte}</span>
        </div>
        {n.badge && <span className="carte-notif__badge">{n.badge}</span>}
        {n.jouer != null && (
          <button
            type="button"
            className="carte-notif__jouer"
            onClick={(e) => {
              e.stopPropagation();
              void api.notifsClic(null, n.jouer ?? null).catch(() => {});
              onFermer();
            }}
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
              <path d="M7 4.5v15l12.5-7.5z" />
            </svg>
            Jouer
          </button>
        )}
      </div>
      <button
        type="button"
        className="carte-notif__fermer"
        aria-label="Fermer"
        onClick={(e) => {
          e.stopPropagation();
          onFermer();
        }}
      >
        ×
      </button>
      <span className="carte-notif__temps" aria-hidden="true" style={{ animationDuration: `${duree}s`, animationPlayState: survol ? "paused" : "running" }} />
    </div>
  );
}
