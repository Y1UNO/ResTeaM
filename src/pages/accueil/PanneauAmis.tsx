import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/commandes";
import { useAmis } from "../../api/requetes";
import type { Ami } from "../../api/types";
import { ilYA, statut } from "../../lib/format";
import { viaCache } from "../../lib/imageLocale";

const MAX = 7;

/**
 * Amis à droite (maquette 01) : avatars ronds seuls quand c'est replié, panneau
 * en verre fumé qui s'ouvre au survol par-dessus le contenu.
 */
export function PanneauAmis() {
  const amis = useAmis();
  const navigate = useNavigate();
  const [ouvert, setOuvert] = useState(false);
  const liste = amis.data?.donnees.amis ?? [];
  if (amis.data?.donnees.prive || (amis.isSuccess && liste.length === 0)) return null;
  if (!amis.data) return null;

  const enJeu = liste.filter((a) => a.jeuEnCours).length;
  const visibles = liste.slice(0, MAX);

  return (
    <aside
      aria-label="Amis"
      className={`amis${ouvert ? " is-ouvert" : ""}`}
      onMouseEnter={() => setOuvert(true)}
      onMouseLeave={() => setOuvert(false)}
      onFocus={() => setOuvert(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOuvert(false)}
    >
      <span className="amis__titre">{ouvert ? `Amis · ${enJeu} en jeu` : String(enJeu)}</span>
      {visibles.map((a) => (
        <LigneAmi key={a.steamId} ami={a} ouvert={ouvert} />
      ))}
      {ouvert && (
        <button type="button" className="amis__ajouter amis__tous" onClick={() => navigate("/amis")}>
          Tous les amis ({liste.length})
        </button>
      )}
      <button
        type="button"
        className="amis__ajouter"
        aria-label="Ajouter un ami"
        onClick={() => void api.steamLien({ type: "amis" })}
      >
        {ouvert ? "+ Ajouter un ami" : "+"}
      </button>
    </aside>
  );
}

function LigneAmi({ ami, ouvert }: { ami: Ami; ouvert: boolean }) {
  const navigate = useNavigate();
  const [ratee, setRatee] = useState(false);
  const enJeu = !!ami.jeuEnCours;
  const enLigne = ami.etat > 0;
  const sous =
    enJeu || enLigne
      ? statut(ami.etat, ami.jeuEnCours)
      : ami.derniereDeconnexion
        ? ilYA(ami.derniereDeconnexion)
        : "Hors ligne";
  const appId = Number(ami.jeuEnCoursId);
  const rejoindre = () => {
    if (ami.lobby && appId) void api.steamLien({ type: "rejoindreLobby", appId, lobby: ami.lobby, steamId: ami.steamId });
    else if (ami.serveur) void api.steamLien({ type: "rejoindreServeur", adresse: ami.serveur });
  };
  const peutRejoindre = (!!ami.lobby && !!appId) || !!ami.serveur;

  return (
    <div className="amis__ligne">
      <div className={`amis__avatar${enJeu || enLigne ? "" : " is-absent"}`} title={`${ami.pseudo} · ${sous}`}>
        {ami.avatar && !ratee ? <img src={viaCache(ami.avatar)} alt="" onError={() => setRatee(true)} /> : null}
        <span className={`amis__point${enJeu ? " is-jeu" : enLigne ? " is-ligne" : ""}`} />
      </div>
      {ouvert && (
        <>
          <button type="button" className="amis__texte amis__texte--lien" onClick={() => navigate(`/profil/${ami.steamId}`)} title="Voir son profil">
            <span className="amis__nom">{ami.pseudo}</span>
            <span className={`amis__sous${enJeu || enLigne ? " is-actif" : ""}`}>{sous}</span>
          </button>
          {peutRejoindre && (
            <button type="button" className="amis__rejoindre" onClick={rejoindre}>
              Rejoindre
            </button>
          )}
        </>
      )}
    </div>
  );
}
