import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/commandes";
import { useBibliotheque, useImages } from "../../api/requetes";
import type { SessionJeu } from "../../api/types";
import { useSessionJeu } from "../../app/sessionJeu";
import { Smoke } from "../../components/Smoke";
import { imagesDe, replierJaquette } from "../../lib/images";
import { bilan, dateDeCle, duree, dureeMs, nuitDe, parNuit } from "../../lib/journal";
import { Calendrier } from "./Calendrier";
import "../pages.css";
import "./journal.css";

type Periode = "12s" | "6m" | "annee" | "tout";
const PERIODES: [Periode, string][] = [
  ["12s", "12 semaines"],
  ["6m", "6 mois"],
  ["annee", "Cette année"],
  ["tout", "Tout"],
];

function bornes(p: Periode): [Date, Date] {
  const fin = new Date();
  const debut = new Date(fin);
  if (p === "12s") debut.setDate(debut.getDate() - 7 * 12 + 1);
  else if (p === "6m") debut.setMonth(debut.getMonth() - 6);
  else if (p === "annee") debut.setMonth(0, 1);
  else debut.setFullYear(debut.getFullYear() - 2);
  debut.setHours(0, 0, 0, 0);
  return [debut, fin];
}

/** Sessions du journal sur une période, avec la partie en cours ajoutée. */
export function useJournal(depuis: Date, jusqu: Date) {
  const enCours = useSessionJeu((s) => s.enCours);
  const q = useQuery({
    queryKey: ["journal", depuis.getTime(), Math.floor(jusqu.getTime() / 60_000)],
    queryFn: () => api.journalSessions(depuis.getTime(), jusqu.getTime() + 6 * 3_600_000),
    staleTime: 60_000,
  });
  const sessions = useMemo<SessionJeu[]>(() => {
    const l = q.data ?? [];
    return enCours && !l.some((s) => s.debut === enCours.debut) ? [...l, enCours] : l;
  }, [q.data, enCours]);
  return { sessions, chargement: q.isLoading };
}

/** Journal de jeu : calendrier des nuits, chiffres de la période, détail d'une nuit. */
export function Journal() {
  const navigate = useNavigate();
  const [periode, setPeriode] = useState<Periode>("12s");
  const [depuis, jusqu] = useMemo(() => bornes(periode), [periode]);
  const { sessions, chargement } = useJournal(depuis, jusqu);
  const nuits = useMemo(() => parNuit(sessions), [sessions]);
  const b = useMemo(() => bilan(sessions), [sessions]);
  const biblio = useBibliotheque();
  const nom = (id: number) => biblio.data?.donnees.jeux.find((j) => j.appId === id)?.nom ?? `Jeu ${id}`;
  const [choisie, setChoisie] = useState<string | null>(null);
  // Par défaut : la dernière nuit jouée.
  useEffect(() => {
    if (!choisie && nuits.size) {
      const cles = [...nuits.keys()].sort();
      setChoisie(cles[cles.length - 1] ?? null);
    }
  }, [nuits, choisie]);
  const nuit = choisie ? nuits.get(choisie) : undefined;
  const ids = useMemo(() => [...new Set([...(nuit?.sessions.map((s) => s.appId) ?? []), ...b.parJeu.slice(0, 5).map((j) => j.appId)])], [nuit, b.parJeu]);
  const images = useImages(ids);
  const maxJeu = b.parJeu[0]?.minutes ?? 1;

  return (
    <div className="page">
      <Smoke variant="top" />
      <div className="page__content journal">
        <header className="page__header journal__entete">
          <div>
            <h1 className="page__title">Journal de jeu</h1>
            <p className="journal__sous-titre">Tes nuits de jeu, notées par ResTeaM depuis qu’il suit tes parties.</p>
          </div>
          <div className="journal__periodes" role="radiogroup" aria-label="Période">
            {PERIODES.map(([p, libelle]) => (
              <button key={p} type="button" role="radio" aria-checked={periode === p} className={`journal__periode${periode === p ? " is-actif" : ""}`} onClick={() => setPeriode(p)}>
                {libelle}
              </button>
            ))}
          </div>
        </header>

        <section className="journal__chiffres" aria-label="Chiffres de la période">
          <Chiffre valeur={duree(b.minutes)} libelle="de jeu" />
          <Chiffre valeur={String(b.nuits)} libelle={b.nuits > 1 ? "nuits de jeu" : "nuit de jeu"} />
          <Chiffre valeur={b.plusLongue ? duree(dureeMs(b.plusLongue) / 60_000) : "—"} libelle="plus longue partie" detail={b.plusLongue ? nom(b.plusLongue.appId) : undefined} />
          <Chiffre valeur={`${b.serie} ${b.serie > 1 ? "nuits" : "nuit"}`} libelle="plus longue série" detail={b.serieActuelle > 1 ? `${b.serieActuelle} d’affilée en ce moment` : undefined} />
        </section>

        <section className="carte journal__calendrier">
          {chargement ? <div className="journal__charge" /> : <Calendrier nuits={nuits} depuis={depuis} jusqu={jusqu} choisie={choisie} onChoisir={setChoisie} />}
          {!chargement && sessions.length === 0 && (
            <p className="journal__vide">Aucune partie notée pour l’instant. Lance un jeu : ResTeaM le note tout seul, même rangé près de l’horloge.</p>
          )}
        </section>

        <div className="journal__bas">
          <section className="carte journal__nuit" aria-live="polite">
            <h2 className="carte__titre">
              {choisie ? dateDeCle(choisie).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "Choisis une nuit"}
            </h2>
            {nuit ? (
              <>
                <p className="journal__total">{duree(nuit.minutes)} de jeu</p>
                <ol className="journal__sessions">
                  {nuit.sessions.map((s) => {
                    const im = imagesDe(s.appId, images.data);
                    const heure = (ms: number) => new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <li key={s.debut}>
                        <button type="button" className="journal__session" onClick={() => navigate(`/jeu/${s.appId}`)}>
                          <img src={im.jaquette ?? undefined} alt="" draggable={false} onError={(e) => replierJaquette(e.currentTarget)} />
                          <span>
                            <strong>{nom(s.appId)}</strong>
                            <span>
                              {heure(s.debut)} → {s.fin ? heure(s.fin) : "en cours"}
                            </span>
                          </span>
                          <em>{duree(dureeMs(s) / 60_000)}</em>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </>
            ) : (
              <p className="journal__vide">{choisie ? "Pas de partie cette nuit-là." : "Clique une case du calendrier."}</p>
            )}
          </section>

          <section className="carte journal__jeux">
            <h2 className="carte__titre">Les plus joués</h2>
            {b.parJeu.length === 0 && <p className="journal__vide">Rien pour cette période.</p>}
            <ol className="journal__classement">
              {b.parJeu.slice(0, 5).map((j, i) => (
                <li key={j.appId} style={{ animationDelay: `${i * 70}ms` }}>
                  <span className="journal__rang">{i + 1}</span>
                  <span className="journal__barre">
                    <strong>{nom(j.appId)}</strong>
                    <span className="journal__jauge">
                      <span style={{ transform: `scaleX(${Math.max(0.03, j.minutes / maxJeu)})` }} />
                    </span>
                  </span>
                  <em>{duree(j.minutes)}</em>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

function Chiffre({ valeur, libelle, detail }: { valeur: string; libelle: string; detail?: string }) {
  return (
    <div className="journal__chiffre" data-lueur="">
      <strong>{valeur}</strong>
      <span>{libelle}</span>
      {detail && <em title={detail}>{detail}</em>}
    </div>
  );
}

/** Pour le profil : les 12 dernières semaines en petit, et un lien vers le journal. */
export function NuitsDeJeu() {
  const navigate = useNavigate();
  const [depuis, jusqu] = useMemo(() => bornes("12s"), []);
  const { sessions } = useJournal(depuis, jusqu);
  const nuits = useMemo(() => parNuit(sessions), [sessions]);
  const b = useMemo(() => bilan(sessions), [sessions]);
  const ceSoir = nuits.get(nuitDe(Date.now()));
  return (
    <div className="nuits-profil">
      <Calendrier nuits={nuits} depuis={depuis} jusqu={jusqu} petit />
      <div className="nuits-profil__texte">
        <strong>{b.nuits} nuits de jeu</strong>
        <span>
          {duree(b.minutes)} en 12 semaines{ceSoir ? ` · ${duree(ceSoir.minutes)} cette nuit` : ""}
        </span>
        <button type="button" className="btn btn--secondaire btn--petit" onClick={() => navigate("/journal")}>
          Ouvrir le journal
        </button>
      </div>
    </div>
  );
}
