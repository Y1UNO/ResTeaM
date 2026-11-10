import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../../api/commandes";
import { useImages } from "../../api/requetes";
import type { AnnonceJeu } from "../../api/types";
import { viaCache } from "../../lib/imageLocale";
import { imagesDe } from "../../lib/images";
import "./historique.css";

const LIBELLES: Record<string, string> = {
  nouveau: "Nouveau",
  equilibrage: "Équilibrage",
  performances: "Performances",
  correctifs: "Correctifs",
  autre: "Autre",
};

const jour = (d: Date) => d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/**
 * Notes de mise à jour d'un jeu, en plein écran (demandes de Tom) : à gauche la frise
 * de toutes les annonces officielles (les plus anciennes se chargent en défilant),
 * à droite l'annonce choisie en grand : bannière, notes en cartes par catégorie,
 * galerie de toutes ses images (agrandies au clic). ↑ / ↓ pour changer d'annonce,
 * Échap pour fermer. Fond : le visuel du jeu, flou et assombri.
 */
export function HistoriqueNotes({ appId, nom, onFermer }: { appId: number; nom: string; onFermer: () => void }) {
  const [sortie, setSortie] = useState(false);
  const [choisie, setChoisie] = useState(0);
  const [agrandie, setAgrandie] = useState<string | null>(null);
  const fin = useRef<HTMLDivElement>(null);
  const lecture = useRef<HTMLDivElement>(null);
  const im = imagesDe(appId, useImages([appId]).data);
  const q = useInfiniteQuery({
    queryKey: ["historique-notes", appId],
    queryFn: ({ pageParam }) => api.historiqueNotes(appId, pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (p) => p.suivant,
    staleTime: 30 * 60_000,
  });
  const annonces = useMemo(() => q.data?.pages.flatMap((p) => p.annonces) ?? [], [q.data]);
  const a = annonces[Math.min(choisie, annonces.length - 1)];

  // Défilement infini de la frise.
  useEffect(() => {
    const el = fin.current;
    if (!el) return;
    const obs = new IntersectionObserver((e) => {
      if (e[0]?.isIntersecting && q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
    }, { rootMargin: "400px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [q]);

  // Nouvelle annonce : la lecture repart du haut, l'entrée de la frise reste visible.
  useEffect(() => {
    lecture.current?.scrollTo({ top: 0 });
    document.querySelector(`[data-annonce="${choisie}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [choisie]);

  const fermer = () => {
    setSortie(true);
    window.setTimeout(onFermer, 380);
  };
  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (agrandie) setAgrandie(null);
        else fermer();
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setChoisie((c) => Math.min(c + 1, annonces.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setChoisie((c) => Math.max(c - 1, 0));
      }
    };
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  });

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="historique-titre" className={`notes-plein${sortie ? " is-sortie" : ""}`}>
      {im.hero && <img className="notes-plein__fond" src={im.hero} alt="" aria-hidden="true" />}
      <span className="notes-plein__voile" aria-hidden="true" />
      <span className="notes-plein__lueur" aria-hidden="true" />

      <header className="notes-plein__barre">
        <div>
          <span className="notes-plein__kicker">Notes de mise à jour</span>
          <h1 id="historique-titre">{nom}</h1>
        </div>
        <span className="notes-plein__compte">
          {annonces.length ? `${annonces.length}${q.hasNextPage ? "+" : ""} annonce${annonces.length > 1 ? "s" : ""}` : ""}
          <span className="notes-plein__touches">↑ ↓ pour naviguer · Échap pour fermer</span>
        </span>
        <button type="button" className="notes-plein__fermer" aria-label="Fermer" onClick={fermer}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div className="notes-plein__corps">
        <nav className="notes-plein__frise" aria-label="Annonces">
          {q.isLoading && <p className="notes-plein__etat">Chargement…</p>}
          <ol>
            {annonces.map((x, i) => {
              const d = new Date(x.date * 1000);
              return (
                <li key={x.id} data-annonce={i}>
                  <button type="button" className={`notes-plein__entree${i === choisie ? " is-choisie" : ""}`} onClick={() => setChoisie(i)}>
                    <span className={`notes-plein__point${x.patch ? " is-patch" : ""}`} aria-hidden="true" />
                    <span className="notes-plein__date">
                      {d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                      {x.version && <em>{x.version}</em>}
                    </span>
                    <strong>{x.titre}</strong>
                  </button>
                </li>
              );
            })}
          </ol>
          <div ref={fin} className="notes-plein__fin">
            {q.isFetchingNextPage ? "Plus anciennes…" : annonces.length && !q.hasNextPage ? "Début de l’historique" : ""}
          </div>
        </nav>

        <div ref={lecture} className="notes-plein__lecture">
          {q.isError && <p className="notes-plein__etat">Steam ne répond pas pour l’instant. Réessaie plus tard.</p>}
          {!q.isLoading && !q.isError && !annonces.length && <p className="notes-plein__etat">Ce jeu n’a pas d’annonce officielle sur Steam.</p>}
          {a && <Lecture key={a.id} a={a} onAgrandir={setAgrandie} />}
          {a && (
            <div className="notes-plein__suite">
              <button type="button" className="btn btn--secondaire btn--petit" disabled={choisie === 0} onClick={() => setChoisie(choisie - 1)}>
                ↑ Plus récente
              </button>
              <button type="button" className="btn btn--secondaire btn--petit" disabled={choisie >= annonces.length - 1} onClick={() => setChoisie(choisie + 1)}>
                Plus ancienne ↓
              </button>
            </div>
          )}
        </div>
      </div>

      {agrandie && (
        <button type="button" className="notes-plein__agrandie" onClick={() => setAgrandie(null)} aria-label="Fermer l’image">
          <img src={viaCache(agrandie)} alt="" draggable={false} />
        </button>
      )}
    </div>,
    document.body,
  );
}

/** L'annonce en grand : bannière, titre, notes en cartes, galerie d'images. */
function Lecture({ a, onAgrandir }: { a: AnnonceJeu; onAgrandir: (url: string) => void }) {
  const d = new Date(a.date * 1000);
  const [banniere, ...galerie] = a.images.length ? a.images : a.image ? [a.image] : [];
  return (
    <article className="notes-plein__annonce">
      {banniere && (
        <button type="button" className="notes-plein__banniere" onClick={() => onAgrandir(banniere)} aria-label="Agrandir l’image">
          <img src={viaCache(banniere)} alt="" draggable={false} />
        </button>
      )}
      <div className="notes-plein__tete">
        <div className="notes-plein__badges">
          {a.patch && <span className="historique__badge">Patch</span>}
          {a.version && <span className="historique__version">{a.version}</span>}
          <time dateTime={d.toISOString()}>{jour(d)}</time>
        </div>
        <h2>{a.titre}</h2>
      </div>

      {a.sections.length > 0 && (
        <div className="notes-plein__sections">
          {a.sections.map((s, i) => (
            <section key={s.categorie} className={`notes-plein__section is-${s.categorie}`} style={{ animationDelay: `${120 + i * 80}ms` }}>
              <h3>
                <span className="notes-plein__puce" aria-hidden="true" />
                {LIBELLES[s.categorie] ?? s.categorie}
                <em>{s.elements.length}</em>
              </h3>
              <ul>
                {s.elements.map((e, j) => (
                  <li key={j}>
                    {e.texte}
                    {e.sous.length > 0 && (
                      <ul>
                        {e.sous.map((x, k) => (
                          <li key={k}>{x}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {a.extrait && <p className="notes-plein__extrait">{a.extrait}</p>}

      {galerie.length > 0 && (
        <div className="notes-plein__galerie">
          {galerie.map((g, i) => (
            <button key={g} type="button" onClick={() => onAgrandir(g)} style={{ animationDelay: `${200 + i * 60}ms` }} aria-label="Agrandir l’image">
              <img src={viaCache(g)} alt="" loading="lazy" draggable={false} onError={(e) => ((e.currentTarget.parentElement as HTMLElement).style.display = "none")} />
            </button>
          ))}
        </div>
      )}

      <button type="button" className="btn btn--lien notes-plein__steam" onClick={() => void api.steamLien({ type: "page", url: a.url })}>
        Ouvrir l’annonce dans Steam
      </button>
    </article>
  );
}
