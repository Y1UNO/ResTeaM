import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  useActusJeu,
  useAmis,
  useBibliotheque,
  useJeuxInstalles,
  useNiveauBadges,
  useRecemmentJoues,
  useSteamLocal,
  useSuccesJeu,
} from "../api/requetes";
import { estErreurApp, type Donnee, type EtatInstallation } from "../api/types";
import { Smoke } from "../components/Smoke";
import { date, entier, heures, ilYA, pourcentage, statut, taille } from "../lib/format";
import { rangDepuisMinutes } from "../lib/rangs";
import "./pages.css";
import "./DonneesTest.css";

/**
 * Page de test provisoire (étape 2b) : affiche les vraies données Steam pour
 * vérifier que tout remonte. Les vrais écrans arrivent aux étapes 3 à 8.
 */
export function DonneesTest() {
  const local = useSteamLocal();
  const biblio = useBibliotheque();
  const installes = useJeuxInstalles(true);
  const recents = useRecemmentJoues();
  const badges = useNiveauBadges();
  const amis = useAmis();

  // Jeu choisi pour les succès et les actus : le plus joué récemment, sinon le plus joué.
  const choix = useMemo(() => {
    const r = recents.data?.donnees ?? [];
    const top = [...(biblio.data?.donnees.jeux ?? [])].sort((a, b) => b.minutesTotal - a.minutesTotal).slice(0, 8);
    const vus = new Set<number>();
    return [...r, ...top].filter((j) => !vus.has(j.appId) && vus.add(j.appId)).map((j) => ({ appId: j.appId, nom: j.nom }));
  }, [recents.data, biblio.data]);
  const [jeu, setJeu] = useState<number | null>(null);
  useEffect(() => {
    if (jeu == null && choix.length) setJeu(choix[0].appId);
  }, [choix, jeu]);
  const succes = useSuccesJeu(jeu);
  const actus = useActusJeu(jeu);

  const b = biblio.data?.donnees;
  const plusJoues = useMemo(
    () => [...(b?.jeux ?? [])].sort((x, y) => y.minutesTotal - x.minutesTotal).slice(0, 12),
    [b],
  );
  const telechargements = (installes.data ?? []).filter((j) => j.etat !== "installe");

  return (
    <div className="page">
      <Smoke variant="top" />
      <div className="page__content">
        <header className="page__header">
          <span className="kicker">
            <span className="kicker__dot" />
            Page de test · étape 2b
          </span>
          <h1 className="page__title">Données Steam</h1>
          <span className="placeholder-note">Vérification des données réelles. Les vrais écrans arrivent ensuite.</span>
        </header>

        <div className="donnees">
          <Carte titre="Steam sur ce PC" etat={local}>
            {local.data &&
              (local.data.trouve ? (
                <>
                  <Ligne cle="Dossier" valeur={local.data.chemin ?? ""} />
                  {local.data.bibliotheques.map((d) => (
                    <Ligne key={d.chemin} cle="Bibliothèque" valeur={`${d.chemin} · ${d.nombreJeux} jeux`} />
                  ))}
                </>
              ) : (
                <p className="message">Steam n’a pas été trouvé sur ce PC.</p>
              ))}
          </Carte>

          <Carte titre="Bibliothèque" etat={biblio} donnee={biblio.data}>
            {b && (
              <>
                <div className="donnees__chiffres">
                  <Chiffre valeur={entier(b.jeux.length)} libelle="jeux" />
                  <Chiffre valeur={entier(b.nombreInstalles)} libelle="installés" />
                  <Chiffre valeur={entier(b.nombreFavoris)} libelle="favoris" />
                  <Chiffre valeur={entier(b.collections.length)} libelle="collections" />
                </div>
                {b.collections.map((c) => (
                  <Ligne
                    key={c.id}
                    cle="Collection"
                    valeur={`${c.nom || "(sans nom)"} · ${c.dynamique ? "dynamique" : `${c.nombre} jeux`}`}
                  />
                ))}
                <h3 className="donnees__sous-titre">Les plus joués</h3>
                <ul className="donnees__liste">
                  {plusJoues.map((j) => {
                    const r = rangDepuisMinutes(j.minutesTotal);
                    return (
                      <li key={j.appId} className="donnees__jeu">
                        <Icone src={j.icone} />
                        <span className="donnees__nom">
                          {j.favori && <span title="Favori">★ </span>}
                          {j.nom}
                        </span>
                        <span className="donnees__rang" title={`Rang ${r.romain} · ${r.nom}`}>
                          {r.romain}
                        </span>
                        <span className="donnees__val">{heures(j.minutesTotal)}</span>
                        <span className="donnees__etat">{j.installation ? libelleEtat(j.installation.etat) : "—"}</span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </Carte>

          <Carte titre="Installés et téléchargements" etat={installes}>
            {installes.data && (
              <>
                <Ligne
                  cle="Installés"
                  valeur={`${installes.data.length} jeux · ${taille(installes.data.reduce((s, j) => s + j.taille, 0))}`}
                />
                {telechargements.length === 0 ? (
                  <p className="donnees__vide">Aucun téléchargement ni mise à jour en cours.</p>
                ) : (
                  telechargements.map((j) => {
                    const p = j.aTelecharger > 0 ? j.telecharge / j.aTelecharger : 0;
                    return (
                      <div key={j.appId} className="donnees__dl">
                        <div className="donnees__dl-haut">
                          <span>{j.nom}</span>
                          <span>
                            {libelleEtat(j.etat)}
                            {j.aTelecharger > 0 && ` · ${pourcentage(p)} de ${taille(j.aTelecharger)}`}
                          </span>
                        </div>
                        <div className="donnees__barre">
                          <div style={{ width: `${p * 100}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}
          </Carte>

          <Carte titre="Joué récemment" etat={recents} donnee={recents.data}>
            {recents.data && (
              <ul className="donnees__liste">
                {recents.data.donnees.length === 0 && <li className="donnees__vide">Rien ces deux dernières semaines.</li>}
                {recents.data.donnees.map((j) => (
                  <li key={j.appId} className="donnees__jeu">
                    <Icone src={j.icone} />
                    <span className="donnees__nom">{j.nom}</span>
                    <span className="donnees__val">{heures(j.minutesDeuxSemaines)} · 2 sem.</span>
                    <span className="donnees__etat">{heures(j.minutesTotal)} au total</span>
                  </li>
                ))}
              </ul>
            )}
          </Carte>

          <Carte titre="Niveau et badges" etat={badges} donnee={badges.data}>
            {badges.data &&
              (() => {
                const n = badges.data.donnees;
                const fait = n.xp - n.xpNiveauActuel;
                const total = fait + n.xpPourSuivant;
                return (
                  <>
                    <div className="donnees__chiffres">
                      <Chiffre valeur={entier(n.niveau)} libelle="niveau" />
                      <Chiffre valeur={entier(n.xp)} libelle="XP" />
                      <Chiffre valeur={entier(n.badges.length)} libelle="badges" />
                    </div>
                    <Ligne cle="Niveau suivant" valeur={`encore ${entier(n.xpPourSuivant)} XP`} />
                    <div className="donnees__barre">
                      <div style={{ width: `${total > 0 ? (fait / total) * 100 : 0}%` }} />
                    </div>
                  </>
                );
              })()}
          </Carte>

          <Carte titre="Amis" etat={amis} donnee={amis.data}>
            {amis.data &&
              (amis.data.donnees.prive ? (
                <p className="donnees__vide">Liste d’amis privée.</p>
              ) : (
                <>
                  <div className="donnees__chiffres">
                    <Chiffre valeur={entier(amis.data.donnees.amis.length)} libelle="amis" />
                    <Chiffre valeur={entier(amis.data.donnees.amis.filter((a) => a.jeuEnCours).length)} libelle="en jeu" />
                    <Chiffre valeur={entier(amis.data.donnees.amis.filter((a) => a.etat > 0).length)} libelle="en ligne" />
                  </div>
                  <ul className="donnees__liste">
                    {amis.data.donnees.amis.slice(0, 10).map((a) => (
                      <li key={a.steamId} className="donnees__jeu">
                        <Icone src={a.avatar} rond />
                        <span className="donnees__nom">{a.pseudo}</span>
                        <span className="donnees__etat">
                          {a.etat === 0 && !a.jeuEnCours
                            ? a.derniereDeconnexion
                              ? ilYA(a.derniereDeconnexion)
                              : "Hors ligne"
                            : statut(a.etat, a.jeuEnCours)}
                          {(a.lobby || a.serveur) && " · peut rejoindre"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ))}
          </Carte>

          <Carte titre="Succès et actus d’un jeu" etat={succes} donnee={succes.data} large>
            <label className="donnees__choix">
              <span>Jeu</span>
              <select value={jeu ?? ""} onChange={(e) => setJeu(Number(e.target.value))}>
                {choix.map((c) => (
                  <option key={c.appId} value={c.appId}>
                    {c.nom}
                  </option>
                ))}
              </select>
            </label>
            <div className="donnees__deux">
              <div>
                <h3 className="donnees__sous-titre">Succès</h3>
                {succes.data &&
                  (succes.data.donnees ? (
                    <>
                      <Ligne
                        cle="Débloqués"
                        valeur={`${succes.data.donnees.debloques}/${succes.data.donnees.total} · ${pourcentage(
                          succes.data.donnees.debloques / Math.max(1, succes.data.donnees.total),
                        )}`}
                      />
                      <ul className="donnees__liste">
                        {succes.data.donnees.succes.slice(0, 6).map((s) => (
                          <li key={s.id} className="donnees__jeu">
                            <Icone src={(s.debloque ? s.icone : s.iconeGrise) ?? ""} />
                            <span className="donnees__nom">{s.nom}</span>
                            <span className="donnees__etat">{s.debloqueLe ? date(s.debloqueLe) : "verrouillé"}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="donnees__vide">Ce jeu n’a pas de succès.</p>
                  ))}
              </div>
              <div>
                <h3 className="donnees__sous-titre">Actus officielles</h3>
                {actus.isLoading && <p className="donnees__vide">Chargement…</p>}
                {actus.isError && <Erreur e={actus.error} />}
                {actus.data && (
                  <ul className="donnees__liste">
                    {actus.data.donnees.length === 0 && <li className="donnees__vide">Aucune actu.</li>}
                    {actus.data.donnees.slice(0, 6).map((a) => (
                      <li key={a.id} className="donnees__actu">
                        <span className="donnees__nom">
                          {a.patch && <span className="donnees__tag">Patch</span>}
                          {a.titre}
                        </span>
                        <span className="donnees__etat">{date(a.date)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Carte>
        </div>
      </div>
    </div>
  );
}

function libelleEtat(e: EtatInstallation): string {
  return {
    installe: "Installé",
    miseAJourRequise: "Mise à jour requise",
    telechargement: "Téléchargement",
    enPause: "En pause",
    autre: "Autre",
  }[e];
}

type EtatRequete = { isLoading: boolean; isError: boolean; error: unknown };

function Carte({
  titre,
  etat,
  donnee,
  large,
  children,
}: {
  titre: string;
  etat: EtatRequete;
  donnee?: Donnee<unknown>;
  large?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`carte donnees__carte${large ? " donnees__carte--large" : ""}`}>
      <div className="donnees__entete">
        <h2 className="carte__titre">{titre}</h2>
        {donnee && (
          <span className="donnees__source" title="Date de récupération auprès de Steam">
            {donnee.horsLigne ? "hors ligne · " : ""}
            {ilYA(donnee.recupereLe)}
          </span>
        )}
      </div>
      {etat.isLoading && <p className="donnees__vide">Chargement…</p>}
      {etat.isError && <Erreur e={etat.error} />}
      {children}
    </section>
  );
}

function Erreur({ e }: { e: unknown }) {
  return <p className="message">{estErreurApp(e) ? e.message : String(e)}</p>;
}

function Ligne({ cle, valeur }: { cle: string; valeur: string }) {
  return (
    <div className="donnees__ligne">
      <span>{cle}</span>
      <span>{valeur}</span>
    </div>
  );
}

function Chiffre({ valeur, libelle }: { valeur: string; libelle: string }) {
  return (
    <div className="donnees__chiffre">
      <strong>{valeur}</strong>
      <span>{libelle}</span>
    </div>
  );
}

function Icone({ src, rond }: { src: string; rond?: boolean }) {
  const [casse, setCasse] = useState(false);
  return (
    <span className={`donnees__icone${rond ? " donnees__icone--rond" : ""}`}>
      {src && !casse && <img src={src} alt="" onError={() => setCasse(true)} />}
    </span>
  );
}
