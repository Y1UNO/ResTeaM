import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../../api/commandes";
import type { AnnonceJeu } from "../../api/types";
import { viaCache } from "../../lib/imageLocale";
import "./historique.css";

const LIBELLES: Record<string, string> = {
  nouveau: "Nouveau",
  equilibrage: "Équilibrage",
  performances: "Performances",
  correctifs: "Correctifs",
  autre: "Autre",
};
const LIGNES_RESUMEES = 6;

/**
 * Toutes les notes de mise à jour d'un jeu, comme sur Steam : des plus récentes aux
 * plus anciennes, en frise chronologique. Les anciennes se chargent en défilant
 * (10 annonces à la fois, depuis l'API d'actualités de Steam).
 */
export function HistoriqueNotes({ appId, nom, onFermer }: { appId: number; nom: string; onFermer: () => void }) {
  const [sortie, setSortie] = useState(false);
  const fin = useRef<HTMLDivElement>(null);
  const q = useInfiniteQuery({
    queryKey: ["historique-notes", appId],
    queryFn: ({ pageParam }) => api.historiqueNotes(appId, pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (p) => p.suivant,
    staleTime: 30 * 60_000,
  });
  const annonces = q.data?.pages.flatMap((p) => p.annonces) ?? [];

  // Défilement infini : la page suivante arrive quand le bas de la liste approche.
  useEffect(() => {
    const el = fin.current;
    if (!el) return;
    const obs = new IntersectionObserver((e) => {
      if (e[0]?.isIntersecting && q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
    }, { rootMargin: "600px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [q]);

  const fermer = () => {
    setSortie(true);
    window.setTimeout(onFermer, 320);
  };
  useEffect(() => {
    const t = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  });

  return createPortal(
    <>
      <div className={`achat__voile ${sortie ? "is-sortie" : ""}`} onClick={fermer} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="historique-titre" className={`historique${sortie ? " is-sortie" : ""}`}>
        <header className="historique__entete">
          <div>
            <span className="historique__kicker">Notes de mise à jour</span>
            <h2 id="historique-titre">{nom}</h2>
            <p>{annonces.length ? `${annonces.length} annonce${annonces.length > 1 ? "s" : ""} chargée${annonces.length > 1 ? "s" : ""}${q.hasNextPage ? ", fais défiler pour les plus anciennes" : ""}` : "Annonces officielles du jeu"}</p>
          </div>
          <button type="button" className="lunes__fermer historique__fermer" aria-label="Fermer" onClick={fermer}>
            ×
          </button>
        </header>
        <div className="historique__liste">
          {q.isLoading && <p className="historique__etat">Chargement des annonces…</p>}
          {q.isError && <p className="historique__etat">Steam ne répond pas pour l’instant. Réessaie plus tard.</p>}
          {!q.isLoading && !q.isError && annonces.length === 0 && <p className="historique__etat">Ce jeu n’a pas d’annonce officielle sur Steam.</p>}
          <ol className="historique__frise">
            {annonces.map((a, i) => (
              <Annonce key={a.id} a={a} index={i} />
            ))}
          </ol>
          <div ref={fin} className="historique__fin">
            {q.isFetchingNextPage ? "Chargement des annonces plus anciennes…" : annonces.length && !q.hasNextPage ? "Début de l’historique" : ""}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

function Annonce({ a, index }: { a: AnnonceJeu; index: number }) {
  const [tout, setTout] = useState(false);
  const d = new Date(a.date * 1000);
  const lignes = a.sections.reduce((n, s) => n + s.elements.length, 0);
  let restantes = tout ? Infinity : LIGNES_RESUMEES;
  return (
    <li className="historique__annonce" style={{ animationDelay: `${Math.min(index % 10, 6) * 50}ms` }}>
      <div className="historique__date" aria-hidden="true">
        <strong>{d.getDate()}</strong>
        <span>{d.toLocaleDateString("fr-FR", { month: "short" })}</span>
        <em>{d.getFullYear()}</em>
      </div>
      <span className={`historique__point${a.patch ? " is-patch" : ""}`} aria-hidden="true" />
      <article className="historique__carte">
        {a.image && <img className="historique__image" src={viaCache(a.image)} alt="" loading="lazy" draggable={false} onError={(e) => (e.currentTarget.style.display = "none")} />}
        <div className="historique__corps">
          <div className="historique__titres">
            {a.patch && <span className="historique__badge">Patch</span>}
            {a.version && <span className="historique__version">{a.version}</span>}
            <time dateTime={d.toISOString()}>{d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</time>
          </div>
          <h3>{a.titre}</h3>
          {a.sections.map((s) => {
            if (restantes <= 0) return null;
            const elements = s.elements.slice(0, restantes);
            restantes -= elements.length;
            return (
              <div key={s.categorie} className="fiche-notes">
                <span className={`fiche-notes__tag is-${s.categorie}`}>{LIBELLES[s.categorie] ?? s.categorie}</span>
                <ul>
                  {elements.map((e, i) => (
                    <li key={i}>
                      {e.texte}
                      {e.sous.length > 0 && (
                        <ul>
                          {e.sous.map((x, j) => (
                            <li key={j}>{x}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {a.extrait && <p className="historique__extrait">{a.extrait}</p>}
          <div className="historique__actions">
            {lignes > LIGNES_RESUMEES && (
              <button type="button" className="btn btn--lien" onClick={() => setTout(!tout)}>
                {tout ? "Réduire" : `Tout afficher (${lignes} lignes)`}
              </button>
            )}
            <button type="button" className="btn btn--lien" onClick={() => void api.steamLien({ type: "page", url: a.url })}>
              Ouvrir l’annonce dans Steam
            </button>
          </div>
        </div>
      </article>
    </li>
  );
}
