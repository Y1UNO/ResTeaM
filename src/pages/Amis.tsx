import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/commandes";
import { useAmis } from "../api/requetes";
import { estErreurApp, type Ami } from "../api/types";
import { Smoke } from "../components/Smoke";
import { Lucioles } from "../components/Vivant";
import { date, ilYA, statut } from "../lib/format";
import { AvatarSteam } from "../components/AvatarSteam";
import "./pages.css";
import "./secondaires.css";

/**
 * Tous les amis (étape 8) : recherche, groupes En jeu / En ligne / Hors ligne,
 * jeu en cours (vers sa fiche), Rejoindre quand c'est possible, profil Steam.
 */
export function Amis() {
  const amis = useAmis();
  const navigate = useNavigate();
  const [filtre, setFiltre] = useState("");
  const d = amis.data?.donnees;
  const groupes = useMemo(() => {
    const q = filtre.trim().toLowerCase();
    const l = (d?.amis ?? []).filter((a) => !q || a.pseudo.toLowerCase().includes(q) || (a.jeuEnCours ?? "").toLowerCase().includes(q));
    const tri = (x: Ami[]) => [...x].sort((a, b) => a.pseudo.localeCompare(b.pseudo, "fr", { sensitivity: "base" }));
    return [
      { id: "jeu", titre: "En jeu", amis: tri(l.filter((a) => a.jeuEnCours)) },
      { id: "ligne", titre: "En ligne", amis: tri(l.filter((a) => !a.jeuEnCours && a.etat > 0)) },
      {
        id: "absent",
        titre: "Hors ligne",
        amis: [...l.filter((a) => !a.jeuEnCours && a.etat === 0)].sort((a, b) => (b.derniereDeconnexion ?? 0) - (a.derniereDeconnexion ?? 0)),
      },
    ];
  }, [d, filtre]);

  return (
    <div className="page">
      <Smoke variant="top" />
      <Lucioles graine={17} nombre={16} />
      <div className="page__content secondaire">
        <header className="secondaire__entete">
          <div className="page__header">
            <h1 className="page__title">Amis</h1>
            <span className="placeholder-note">
              {d ? (d.prive ? "Liste d’amis privée" : `${d.amis.length} amis · ${groupes[0].amis.length} en jeu`) : "Chargement…"}
              {amis.data?.horsLigne && " · hors ligne"}
            </span>
          </div>
          <div className="secondaire__actions">
            <label className="biblio__recherche">
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <span className="sr-only">Chercher un ami</span>
              <input value={filtre} onChange={(e) => setFiltre(e.target.value)} placeholder="Chercher un ami ou un jeu" spellCheck={false} />
            </label>
            <button type="button" className="btn btn--secondaire btn--petit" onClick={() => navigate("/ensemble")}>
              Jeux en commun
            </button>
            <button type="button" className="btn btn--principal btn--petit" onClick={() => void api.steamLien({ type: "amis" })}>
              + Ajouter un ami
            </button>
          </div>
        </header>

        {amis.isError && <p className="message">{estErreurApp(amis.error) ? amis.error.message : String(amis.error)}</p>}
        {d?.prive && (
          <div className="vide">
            <strong>Ta liste d’amis est privée</strong>
            <span>Rends-la visible dans les paramètres de confidentialité de Steam pour la voir ici.</span>
          </div>
        )}
        {d && !d.prive && d.amis.length === 0 && (
          <div className="vide">
            <strong>Pas encore d’amis</strong>
            <span>Ajoute des amis depuis Steam : ils apparaîtront ici avec ce qu’ils jouent.</span>
          </div>
        )}

        {groupes.map(
          (g) =>
            g.amis.length > 0 && (
              <section key={g.id} className="secondaire__bloc" aria-labelledby={`amis-${g.id}`}>
                <h2 id={`amis-${g.id}`} className="secondaire__titre">
                  {g.titre} <span className="secondaire__compte">{g.amis.length}</span>
                </h2>
                <div className="amis-grille">
                  {g.amis.map((a, i) => (
                    <CarteAmi key={a.steamId} ami={a} index={i} />
                  ))}
                </div>
              </section>
            ),
        )}
      </div>
    </div>
  );
}

function CarteAmi({ ami, index }: { ami: Ami; index: number }) {
  const navigate = useNavigate();
  const [ratee] = useState(false);
  const enJeu = !!ami.jeuEnCours;
  const enLigne = ami.etat > 0;
  const appId = Number(ami.jeuEnCoursId);
  const peutRejoindre = (!!ami.lobby && !!appId) || !!ami.serveur;
  const sous = enJeu || enLigne ? statut(ami.etat, ami.jeuEnCours) : ami.derniereDeconnexion ? `vu ${ilYA(ami.derniereDeconnexion)}` : "Hors ligne";

  const rejoindre = () => {
    if (ami.lobby && appId) void api.steamLien({ type: "rejoindreLobby", appId, lobby: ami.lobby, steamId: ami.steamId });
    else if (ami.serveur) void api.steamLien({ type: "rejoindreServeur", adresse: ami.serveur });
  };

  return (
    <article
      data-lueur=""
      className={`ami-carte${enJeu ? " is-jeu" : enLigne ? " is-ligne" : ""}`}
      style={{ animationDelay: `${Math.min(index, 16) * 30}ms` }}
    >
      {/* Toute la carte ouvre le profil de l'ami ; les boutons d'action restent au-dessus. */}
      <button type="button" className="ami-carte__ouvrir" aria-label={`Voir le profil de ${ami.pseudo}`} onClick={() => navigate(`/profil/${ami.steamId}`)} />
      <span className="ami-carte__avatar">
        {ami.avatar && !ratee && <AvatarSteam steamId={ami.steamId} avatar={ami.avatar} />}
        <span className="ami-carte__point" />
      </span>
      <span className="ami-carte__texte">
        <strong>{ami.pseudo}</strong>
        {enJeu && appId ? (
          <button type="button" className="ami-carte__jeu" onClick={() => navigate(`/jeu/${appId}`)}>
            {ami.jeuEnCours}
          </button>
        ) : (
          <span className="ami-carte__sous">{sous}</span>
        )}
        {ami.amiDepuis > 0 && <span className="ami-carte__depuis">ami depuis le {date(ami.amiDepuis)}</span>}
      </span>
      <span className="ami-carte__actions">
        {peutRejoindre && (
          <button type="button" className="amis__rejoindre" onClick={rejoindre}>
            Rejoindre
          </button>
        )}
        {ami.urlProfil && (
          <button
            type="button"
            className="ami-carte__profil"
            aria-label={`Profil Steam de ${ami.pseudo}`}
            title="Profil Steam"
            onClick={() => void api.steamLien({ type: "page", url: ami.urlProfil })}
          >
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 17L17 7M9 7h8v8" />
            </svg>
          </button>
        )}
      </span>
    </article>
  );
}
