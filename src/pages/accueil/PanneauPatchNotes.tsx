import { useEffect, useRef } from "react";
import { api } from "../../api/commandes";
import type { CategorieNotes, PatchNotes } from "../../api/types";
import { ilYA } from "../../lib/format";

const LIBELLES: Record<CategorieNotes, { tag: string; titre: string }> = {
  nouveau: { tag: "Nouveau", titre: "Contenu" },
  equilibrage: { tag: "Équilibrage", titre: "Ajustements" },
  performances: { tag: "Performances", titre: "Fluidité et stabilité" },
  correctifs: { tag: "Correctifs", titre: "Corrections de bugs" },
  autre: { tag: "Autre", titre: "Autres changements" },
};

type Props = {
  notes: PatchNotes;
  nomJeu: string;
  jaquette: string | null;
  /** Fermeture en cours : le panneau se replie vers la jaquette. */
  fermeture: boolean;
  onFermer: () => void;
};

/**
 * Patch notes de la maquette 01 : le panneau se déploie depuis la jaquette,
 * sections triées automatiquement. Jamais de fermeture instantanée.
 */
export function PanneauPatchNotes({ notes, nomJeu, jaquette, fermeture, onFermer }: Props) {
  const fermerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fermerRef.current?.focus({ preventScroll: true });
    const touche = (e: KeyboardEvent) => e.key === "Escape" && onFermer();
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [onFermer]);

  return (
    <>
      <div className={`notes__voile ${fermeture ? "bdOut" : "bdIn"}`} onClick={onFermer} aria-hidden="true" />
      <article role="dialog" aria-modal="true" aria-labelledby="pn-titre" className={`notes ${fermeture ? "fold" : "unfold"}`}>
        <header className="notes__entete">
          <div
            className="notes__vignette"
            style={jaquette ? { backgroundImage: `url("${jaquette}")` } : undefined}
            aria-hidden="true"
          />
          <div className="notes__infos">
            <span className="notes__kicker">
              {notes.patch ? "Patch notes" : "Dernière annonce"} · {ilYA(notes.date, true)}
            </span>
            <h2 id="pn-titre" className="notes__titre">
              {notes.titre}
            </h2>
            <span className="notes__sous">
              {nomJeu}
              {notes.version && ` · version ${notes.version}`}
            </span>
          </div>
          <button ref={fermerRef} type="button" className="notes__fermer" aria-label="Fermer les patch notes" onClick={onFermer}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="notes__corps">
          {notes.sections.length === 0 && (
            <p className="notes__vide">Cette annonce ne contient pas de liste de changements. Ouvre-la sur Steam pour la lire.</p>
          )}
          {notes.sections.map((s) => (
            <section key={s.categorie} className="notes__section">
              <h3 className="notes__section-titre">
                <span className="notes__tag">{LIBELLES[s.categorie].tag}</span>
                {LIBELLES[s.categorie].titre}
              </h3>
              <ul className="notes__liste">
                {s.elements.map((e, i) => (
                  <li key={i}>
                    <span className="notes__point" aria-hidden="true" />
                    <div>
                      <span>{e.texte}</span>
                      {e.sous.length > 0 && (
                        <ul className="notes__sous-liste">
                          {e.sous.map((x, j) => (
                            <li key={j}>{x}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {notes.url && (
            <button type="button" className="notes__lien" onClick={() => void api.steamLien({ type: "page", url: notes.url })}>
              Lire l’annonce complète sur Steam →
            </button>
          )}
        </div>
      </article>
    </>
  );
}
