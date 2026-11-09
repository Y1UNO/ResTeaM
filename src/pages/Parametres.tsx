import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/commandes";
import { useJoueurMoi } from "../api/requetes";
import { estErreurApp } from "../api/types";
import { FormulaireCle } from "../components/FormulaireCle";
import { IconPerson } from "../components/icons";
import { Smoke } from "../components/Smoke";
import { useSession } from "../app/session";
import "./pages.css";
import "./Parametres.css";
import { viaCache } from "../lib/imageLocale";

/** Paramètres : compte Steam (déconnexion) et clé Steam Web API (remplacer, supprimer). */
export function Parametres() {
  const joueur = useJoueurMoi();
  const steamId = useSession((s) => s.steamId);
  const deconnecte = useSession((s) => s.deconnecte);
  const cleSupprimee = useSession((s) => s.cleSupprimee);
  const client = useQueryClient();

  const [remplacer, setRemplacer] = useState(false);
  const [confirmerSuppression, setConfirmerSuppression] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const seDeconnecter = async () => {
    await api.deconnexion().catch(() => {});
    client.clear();
    deconnecte();
  };

  const supprimerCle = async () => {
    try {
      await api.cleSupprimer();
      client.clear();
      cleSupprimee();
    } catch (e) {
      setInfo(estErreurApp(e) ? e.message : String(e));
    }
  };

  const j = joueur.data?.donnees;

  return (
    <div className="page">
      <Smoke variant="top" />
      <div className="page__content parametres">
        <header className="page__header">
          <h1 className="page__title">Paramètres</h1>
        </header>

        <section className="carte parametres__bloc" aria-labelledby="p-compte">
          <h2 id="p-compte" className="carte__titre">
            Compte Steam
          </h2>
          <div className="parametres__compte">
            <span className="parametres__avatar">{j?.avatar ? <img src={viaCache(j.avatar)} alt="" /> : <IconPerson size={26} />}</span>
            <div className="parametres__identite">
              <strong>{j?.pseudo ?? (joueur.isLoading ? "Chargement…" : "Compte Steam")}</strong>
              <span>
                SteamID {steamId}
                {joueur.data?.horsLigne && " · hors ligne, dernières données connues"}
              </span>
            </div>
            <button type="button" className="btn btn--secondaire btn--petit" onClick={seDeconnecter}>
              Se déconnecter
            </button>
          </div>
          {joueur.isError && (
            <p className="message">{estErreurApp(joueur.error) ? joueur.error.message : "Profil indisponible."}</p>
          )}
        </section>

        <section className="carte parametres__bloc" aria-labelledby="p-cle">
          <h2 id="p-cle" className="carte__titre">
            Clé Steam Web API
          </h2>
          <div className="parametres__etat">
            <span className="parametres__point" aria-hidden="true" />
            Enregistrée dans le Gestionnaire d’identifiants Windows. Elle n’est jamais affichée.
          </div>

          {info && <p className="message">{info}</p>}

          {remplacer ? (
            <div className="parametres__remplacer">
              <FormulaireCle
                libelle="Remplacer"
                onEnregistree={() => {
                  setRemplacer(false);
                  setInfo("Nouvelle clé enregistrée.");
                  void client.invalidateQueries();
                }}
              />
              <button type="button" className="btn btn--lien" onClick={() => setRemplacer(false)}>
                Annuler
              </button>
            </div>
          ) : confirmerSuppression ? (
            <div className="parametres__confirmation">
              <span>Supprimer la clé ? Il faudra en saisir une pour continuer.</span>
              <button type="button" className="btn btn--secondaire btn--petit" onClick={() => setConfirmerSuppression(false)}>
                Garder
              </button>
              <button type="button" className="btn btn--principal btn--petit" onClick={supprimerCle}>
                Supprimer
              </button>
            </div>
          ) : (
            <div className="parametres__actions">
              <button
                type="button"
                className="btn btn--secondaire btn--petit"
                onClick={() => {
                  setInfo(null);
                  setRemplacer(true);
                }}
              >
                Remplacer la clé
              </button>
              <button type="button" className="btn btn--secondaire btn--petit" onClick={() => void api.ouvrirPageCleApi()}>
                Gérer ma clé sur Steam
              </button>
              <button
                type="button"
                className="btn btn--lien parametres__supprimer"
                onClick={() => {
                  setInfo(null);
                  setConfirmerSuppression(true);
                }}
              >
                Supprimer la clé
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
