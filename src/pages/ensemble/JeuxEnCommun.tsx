import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { api } from "../../api/commandes";
import { useAmis, useBibliotheque, useImages, useJoueurMoi } from "../../api/requetes";
import { useSession } from "../../app/session";
import type { Ami, JeuBibliotheque, JeuPossede } from "../../api/types";
import { AvatarSteam } from "../../components/AvatarSteam";
import { Smoke } from "../../components/Smoke";
import { entier, heures } from "../../lib/format";
import { imagesDe, replierJaquette } from "../../lib/images";
import "../pages.css";
import "./ensemble.css";

/** Au plus 3 amis (plus Tom) : au-delà, il ne reste presque jamais de jeu en commun. */
export const MAX_AMIS = 3;
const steamIdValide = (id: string) => /^\d{17}$/.test(id);
const jouable = (j: JeuBibliotheque) => j.installation?.etat === "installe" || j.installation?.etat === "miseAJourRequise";

type Tri = "ensemble" | "recents" | "nom";
type Personne = { steamId: string; pseudo: string; avatar: string };
/** Ce que chacun a passé sur un jeu (dans l'ordre : toi, puis les amis choisis). */
type JeuCommun = { jeu: JeuBibliotheque; minutes: number[]; recentes: number; total: number };

/**
 * Jeux en commun (idée de Tom) : choisir 1 à 3 amis et voir les jeux que vous
 * possédez tous, avec les heures de chacun. Idéal pour organiser une soirée.
 * Les bibliothèques des amis viennent de `profil_joueur` (profils publics seulement).
 */
export function JeuxEnCommun() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const choisis = useMemo(
    () => [...new Set((params.get("amis") ?? "").split(",").filter(steamIdValide))].slice(0, MAX_AMIS),
    [params],
  );
  const choisir = (ids: string[]) => setParams(ids.length ? { amis: ids.join(",") } : {}, { replace: true });

  const moiId = useSession((s) => s.steamId);
  const moi = useJoueurMoi().data?.donnees;
  const amis = useAmis();
  const listeAmis = amis.data?.donnees.amis ?? [];
  const biblio = useBibliotheque();
  const mesJeux = useMemo(() => (biblio.data?.donnees.jeux ?? []).filter((j) => !j.cache), [biblio.data]);

  // Même clé que `useProfilJoueur` : le cache est partagé avec la page de profil.
  const profils = useQueries({
    queries: choisis.map((id) => ({ queryKey: ["profil-joueur", id], queryFn: () => api.profilJoueur(id), staleTime: 5 * 60_000 })),
  });
  const personnes: Personne[] = choisis.map((id, i) => {
    const a = listeAmis.find((x) => x.steamId === id);
    const p = profils[i]?.data?.donnees.joueur;
    return { steamId: id, pseudo: a?.pseudo ?? p?.pseudo ?? "…", avatar: a?.avatar ?? p?.avatar ?? "" };
  });
  const charges = profils.length > 0 && profils.every((p) => !p.isLoading);
  const prives = choisis.filter((_, i) => profils[i]?.data && !profils[i].data?.donnees.jeux);
  const enErreur = choisis.filter((_, i) => profils[i]?.isError);
  /** Bibliothèques lisibles (les privées sont mises de côté). */
  const bibliosAmis = useMemo(
    () =>
      choisis
        .map((id, i) => ({ id, jeux: profils[i]?.data?.donnees.jeux ?? null }))
        .filter((x): x is { id: string; jeux: JeuPossede[] } => !!x.jeux)
        .map((x) => ({ id: x.id, parId: new Map(x.jeux.map((j) => [j.appId, j])) })),
    // Les données d'un profil ne changent que quand il est relu (`dataUpdatedAt`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [choisis.join(","), profils.map((p) => p.dataUpdatedAt).join(",")],
  );

  const [tri, setTri] = useState<Tri>("ensemble");
  const [installes, setInstalles] = useState(false);

  const communs = useMemo<JeuCommun[]>(() => {
    if (!bibliosAmis.length) return [];
    return mesJeux
      .filter((j) => bibliosAmis.every((b) => b.parId.has(j.appId)))
      .map((j) => {
        const autres = bibliosAmis.map((b) => b.parId.get(j.appId) as JeuPossede);
        const minutes = [j.minutesTotal, ...autres.map((x) => x.minutesTotal)];
        const recentes = j.minutesDeuxSemaines + autres.reduce((s, x) => s + x.minutesDeuxSemaines, 0);
        return { jeu: j, minutes, recentes, total: minutes.reduce((s, m) => s + m, 0) };
      });
  }, [mesJeux, bibliosAmis]);

  const affiches = useMemo(() => {
    const l = installes ? communs.filter((c) => jouable(c.jeu)) : [...communs];
    if (tri === "nom") l.sort((a, b) => a.jeu.nom.localeCompare(b.jeu.nom, "fr", { sensitivity: "base" }));
    else if (tri === "recents") l.sort((a, b) => b.recentes - a.recentes || b.total - a.total);
    // « Joués ensemble » : d'abord les jeux où le moins joueur a le plus d'heures, puis le total.
    else l.sort((a, b) => Math.min(...b.minutes) - Math.min(...a.minutes) || b.total - a.total);
    return l;
  }, [communs, tri, installes]);

  /** Jeux que les amis ont tous, mais pas Tom : une idée d'achat pour la soirée. */
  const sansMoi = useMemo(() => {
    if (!bibliosAmis.length) return [];
    const miens = new Set(mesJeux.map((j) => j.appId));
    const [premier, ...reste] = bibliosAmis;
    return [...premier.parId.values()]
      .filter((j) => !miens.has(j.appId) && reste.every((b) => b.parId.has(j.appId)))
      .map((j) => ({ jeu: j, total: bibliosAmis.reduce((s, b) => s + (b.parId.get(j.appId)?.minutesTotal ?? 0), 0) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [mesJeux, bibliosAmis]);

  const images = useImages([...affiches.slice(0, 160).map((c) => c.jeu.appId), ...sansMoi.map((x) => x.jeu.appId)]);
  const nbInstalles = communs.filter((c) => jouable(c.jeu)).length;
  /** Le jeu où celui qui a le moins joué a le plus d'heures. */
  const plusJoue = communs.reduce<JeuCommun | null>((m, c) => (!m || Math.min(...c.minutes) > Math.min(...m.minutes) ? c : m), null);
  const toi: Personne = { steamId: moiId ?? "", pseudo: "Toi", avatar: moi?.avatar ?? "" };
  const lecteurs = [toi, ...personnes.filter((p) => bibliosAmis.some((b) => b.id === p.steamId))];

  return (
    <div className="page">
      <Smoke variant="top" />
      <div className="page__content ensemble">
        <header className="ensemble__entete">
          <div>
            <h1 className="page__title">Jeux en commun</h1>
            <p className="ensemble__sous-titre">Choisis jusqu’à {MAX_AMIS} amis : voici les jeux que vous avez tous. Idéal pour organiser une soirée.</p>
          </div>
        </header>

        <section className="ensemble__equipe" aria-label="Les joueurs de la soirée">
          <span className="ensemble__joueur is-moi">
            <Avatar steamId={moiId} avatar={moi?.avatar} pseudo="Toi" />
            <strong>Toi</strong>
          </span>
          {personnes.map((p, i) => (
            <span key={p.steamId} className={`ensemble__joueur${prives.includes(p.steamId) ? " is-prive" : ""}`} style={{ animationDelay: `${i * 50}ms` }}>
              <span className="ensemble__plus" aria-hidden="true">+</span>
              <Avatar steamId={p.steamId} avatar={p.avatar} pseudo={p.pseudo} />
              <strong>{p.pseudo}</strong>
              {profils[i]?.isLoading && <em>lecture…</em>}
              {prives.includes(p.steamId) && <em>bibliothèque privée</em>}
              <button type="button" className="ensemble__retirer" aria-label={`Retirer ${p.pseudo}`} onClick={() => choisir(choisis.filter((x) => x !== p.steamId))}>
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </span>
          ))}
          {choisis.length < MAX_AMIS && <ChoixAmi amis={listeAmis} exclus={choisis} onChoisir={(id) => choisir([...choisis, id])} chargement={amis.isLoading} prive={!!amis.data?.donnees.prive} />}
        </section>

        {choisis.length === 0 ? (
          <Suggestions amis={listeAmis} onChoisir={(id) => choisir([id])} />
        ) : (
          <>
            {enErreur.length > 0 && <p className="message">Steam n’a pas répondu pour {enErreur.length > 1 ? "certains amis" : "un ami"}. Réessaie dans un moment.</p>}
            {charges && bibliosAmis.length === 0 ? (
              <div className="vide">
                <strong>Bibliothèque privée</strong>
                <span>Steam ne montre pas les jeux {prives.length > 1 ? "de ces amis" : "de cet ami"}. Choisis quelqu’un d’autre.</span>
              </div>
            ) : (
              <>
                <section className="ensemble__chiffres">
                  <div className="journal__chiffre ensemble__gros">
                    <strong>{charges && biblio.data ? entier(communs.length) : "…"}</strong>
                    <span>jeu{communs.length > 1 ? "x" : ""} en commun</span>
                    {prives.length > 0 && <em>sans {personnes.filter((p) => prives.includes(p.steamId)).map((p) => p.pseudo).join(" ni ")} (bibliothèque privée)</em>}
                  </div>
                  <div className="journal__chiffre">
                    <strong>{charges ? entier(nbInstalles) : "…"}</strong>
                    <span>déjà installé{nbInstalles > 1 ? "s" : ""} chez toi</span>
                  </div>
                  <div className="journal__chiffre">
                    <strong className="ensemble__nom-chiffre">{plusJoue?.jeu.nom ?? "—"}</strong>
                    <span>le plus joué par tout le monde</span>
                  </div>
                </section>

                <div className="ensemble__outils">
                  <div className="journal__periodes" role="tablist" aria-label="Tri">
                    {(
                      [
                        ["ensemble", "Joués par tous"],
                        ["recents", "Ces 2 semaines"],
                        ["nom", "Nom"],
                      ] as [Tri, string][]
                    ).map(([t, libelle]) => (
                      <button key={t} type="button" role="tab" aria-selected={tri === t} className={`journal__periode${tri === t ? " is-actif" : ""}`} onClick={() => setTri(t)}>
                        {libelle}
                      </button>
                    ))}
                  </div>
                  <button type="button" aria-pressed={installes} className={`ensemble__filtre${installes ? " is-actif" : ""}`} onClick={() => setInstalles((x) => !x)}>
                    <span className="ensemble__case" aria-hidden="true" />
                    Installés chez moi
                  </button>
                </div>

                {charges && affiches.length === 0 && (
                  <p className="journal__vide">{installes && communs.length ? "Aucun jeu en commun installé chez toi." : "Aucun jeu en commun. Regarde ceux qu’ils ont tous, plus bas."}</p>
                )}
                <ul className="ensemble__grille">
                  {affiches.map((c, i) => (
                    <CarteCommun key={c.jeu.appId} c={c} lecteurs={lecteurs} index={i} jaquette={i < 160 ? (imagesDe(c.jeu.appId, images.data).jaquettePetite ?? null) : null} onOuvrir={() => navigate(`/jeu/${c.jeu.appId}`)} />
                  ))}
                </ul>

                {charges && sansMoi.length > 0 && (
                  <section className="ensemble__sans-moi" aria-labelledby="ensemble-sans-moi">
                    <h2 id="ensemble-sans-moi" className="secondaire__titre">
                      {bibliosAmis.length > 1 ? "Ils l’ont tous, pas toi" : "Il l’a, pas toi"}
                    </h2>
                    <ul>
                      {sansMoi.map(({ jeu, total }) => (
                        <li key={jeu.appId}>
                          <button type="button" onClick={() => navigate(`/jeu/${jeu.appId}`)} title={jeu.nom}>
                            <img src={imagesDe(jeu.appId, images.data).jaquettePetite ?? undefined} alt="" loading="lazy" draggable={false} onError={(e) => replierJaquette(e.currentTarget)} />
                            <strong>{jeu.nom}</strong>
                            <span>{total > 0 ? `${heures(total)} à eux ${bibliosAmis.length > 1 ? "tous" : "seul"}` : "jamais lancé"}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CarteCommun({ c, lecteurs, index, jaquette, onOuvrir }: { c: JeuCommun; lecteurs: Personne[]; index: number; jaquette: string | null; onOuvrir: () => void }) {
  const max = Math.max(1, ...c.minutes);
  const installe = jouable(c.jeu);
  return (
    <li className="ensemble-carte" style={{ animationDelay: `${Math.min(index, 20) * 30}ms` }}>
      <button type="button" className="ensemble-carte__ouvrir" onClick={onOuvrir} aria-label={`Fiche de ${c.jeu.nom}`}>
        <span className="ensemble-carte__jaquette">
          {jaquette && <img src={jaquette} alt="" loading="lazy" draggable={false} onError={(e) => replierJaquette(e.currentTarget)} />}
          {installe && <span className="pile__installe">Installé</span>}
        </span>
      </button>
      <div className="ensemble-carte__corps">
        <strong className="ensemble-carte__nom" title={c.jeu.nom}>
          {c.jeu.nom}
        </strong>
        <ul className="ensemble-carte__heures" aria-label="Heures de chacun">
          {lecteurs.map((p, i) => (
            <li key={p.steamId || i} title={`${p.pseudo} : ${c.minutes[i] ? heures(c.minutes[i]) : "jamais lancé"}`}>
              <Avatar steamId={p.steamId} avatar={p.avatar} pseudo={p.pseudo} className="ensemble-carte__mini" />
              <span className="ensemble-carte__barre">
                <span style={{ transform: `scaleX(${(c.minutes[i] ?? 0) / max})` }} />
              </span>
              <em>{c.minutes[i] ? heures(c.minutes[i]) : "—"}</em>
            </li>
          ))}
        </ul>
        <div className="ensemble-carte__actions">
          {installe ? (
            <button type="button" className="btn btn--principal btn--petit" onClick={() => void api.steamLien({ type: "jouer", appId: c.jeu.appId })}>
              Jouer
            </button>
          ) : (
            <button type="button" className="btn btn--secondaire btn--petit" onClick={onOuvrir}>
              Voir la fiche
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/** Bouton « + Ajouter un ami » et sa liste, avec une recherche. */
function ChoixAmi({ amis, exclus, onChoisir, chargement, prive }: { amis: Ami[]; exclus: string[]; onChoisir: (id: string) => void; chargement: boolean; prive: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const [q, setQ] = useState("");
  const boite = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: MouseEvent) => {
      if (!boite.current?.contains(e.target as Node)) setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => e.key === "Escape" && setOuvert(false);
    document.addEventListener("mousedown", fermer);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("mousedown", fermer);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);
  const liste = useMemo(() => {
    const t = q.trim().toLowerCase();
    return trierAmis(amis.filter((a) => !exclus.includes(a.steamId) && (!t || a.pseudo.toLowerCase().includes(t))));
  }, [amis, exclus, q]);

  return (
    <div className="ensemble__choix" ref={boite}>
      <button type="button" className="ensemble__ajouter" aria-expanded={ouvert} onClick={() => setOuvert((x) => !x)}>
        <span aria-hidden="true">+</span> Ajouter un ami
      </button>
      {ouvert && (
        <div className="ensemble__liste" role="dialog" aria-label="Choisir un ami">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un ami" spellCheck={false} />
          <ul>
            {chargement && <li className="ensemble__liste-vide">Chargement…</li>}
            {prive && <li className="ensemble__liste-vide">Ta liste d’amis est privée.</li>}
            {!chargement && !prive && liste.length === 0 && <li className="ensemble__liste-vide">Aucun ami trouvé.</li>}
            {liste.map((a) => (
              <li key={a.steamId}>
                <button
                  type="button"
                  onClick={() => {
                    onChoisir(a.steamId);
                    setOuvert(false);
                    setQ("");
                  }}
                >
                  <Avatar steamId={a.steamId} avatar={a.avatar} pseudo={a.pseudo} className="ensemble__avatar is-petit" />
                  <span>{a.pseudo}</span>
                  <em className={a.jeuEnCours ? "is-jeu" : a.etat > 0 ? "is-ligne" : ""}>{a.jeuEnCours ?? (a.etat > 0 ? "en ligne" : "hors ligne")}</em>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Avatar rond, avec l'initiale du pseudo derrière (visible si l'image manque). */
export function Avatar({ steamId, avatar, pseudo, className = "ensemble__avatar" }: { steamId: string | null | undefined; avatar: string | null | undefined; pseudo: string; className?: string }) {
  return (
    <span className={`${className} ensemble__rond`}>
      <span className="ensemble__initiale" aria-hidden="true">
        {pseudo.trim().charAt(0).toUpperCase()}
      </span>
      <AvatarSteam steamId={steamId} avatar={avatar} />
    </span>
  );
}

/** En jeu, puis en ligne, puis les autres ; par pseudo dans chaque groupe. */
function trierAmis(l: Ami[]) {
  const poids = (a: Ami) => (a.jeuEnCours ? 0 : a.etat > 0 ? 1 : 2);
  return [...l].sort((a, b) => poids(a) - poids(b) || a.pseudo.localeCompare(b.pseudo, "fr", { sensitivity: "base" }));
}

/** Avant de choisir : les amis connectés en raccourci. */
function Suggestions({ amis, onChoisir }: { amis: Ami[]; onChoisir: (id: string) => void }) {
  const proposes = trierAmis(amis).slice(0, 8);
  return (
    <div className="vide ensemble__vide">
      <strong>Avec qui, ce soir ?</strong>
      <span>Ajoute un ou plusieurs amis : ResTeaM croise vos bibliothèques (profils publics seulement).</span>
      {proposes.length > 0 && (
        <div className="ensemble__suggestions">
          {proposes.map((a) => (
            <button key={a.steamId} type="button" onClick={() => onChoisir(a.steamId)}>
              <Avatar steamId={a.steamId} avatar={a.avatar} pseudo={a.pseudo} className="ensemble__avatar is-petit" />
              {a.pseudo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
