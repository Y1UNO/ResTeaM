import { Navigate } from "react-router-dom";
import { api } from "../api/commandes";
import { FormulaireCle } from "../components/FormulaireCle";
import { useSession } from "../app/session";
import { PATHS } from "../app/paths";
import { EcranPlein } from "./EcranPlein";

/** Juste après la première connexion : enregistrer sa clé Steam Web API. */
export function CleApi() {
  const statut = useSession((s) => s.statut);
  const cleEnregistree = useSession((s) => s.cleEnregistree);
  const deconnecte = useSession((s) => s.deconnecte);

  if (statut === "deconnecte") return <Navigate to={PATHS.connexion} replace />;
  if (statut === "pret") return <Navigate to={PATHS.accueil} replace />;

  const changerDeCompte = async () => {
    await api.deconnexion().catch(() => {});
    deconnecte();
  };

  return (
    <EcranPlein large>
      <span className="kicker">
        <span className="kicker__dot" />
        Dernière étape
      </span>
      <h1 className="ecran__titre ecran__titre--moyen">Ta clé Steam Web API</h1>
      <p className="ecran__texte">
        ResTeaM lit ta bibliothèque, tes succès et tes amis avec ta propre clé. Elle reste sur ce PC.
      </p>

      <div className="cle__carte">
        <ol className="cle__etapes">
          <li className="cle__etape">
            <span className="cle__num">1</span>
            Ouvre la page des clés sur Steam.
            <button type="button" className="btn btn--secondaire btn--petit" onClick={() => void api.ouvrirPageCleApi()}>
              Obtenir ma clé
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M7 17L17 7M9 7h8v8" />
              </svg>
            </button>
          </li>
          <li className="cle__etape">
            <span className="cle__num">2</span>
            <span>
              Nom de domaine : écris <code>localhost</code>, accepte les conditions, valide.
            </span>
          </li>
          <li className="cle__etape">
            <span className="cle__num">3</span>
            Copie la clé et colle-la ci-dessous.
          </li>
        </ol>

        <FormulaireCle onEnregistree={cleEnregistree} />

        <span className="cle__securite">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          Rangée dans le Gestionnaire d’identifiants Windows, jamais affichée ni envoyée ailleurs qu’à Steam.
        </span>
      </div>

      <button type="button" className="btn btn--lien" onClick={changerDeCompte}>
        Ce n’est pas ton compte ? Se déconnecter
      </button>
    </EcranPlein>
  );
}
