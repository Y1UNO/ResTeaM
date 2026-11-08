import { useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api/commandes";
import { estErreurApp } from "../api/types";
import { Logo } from "../components/Logo";
import { useSession } from "../app/session";
import { PATHS } from "../app/paths";
import { EcranPlein } from "./EcranPlein";

type Phase = { etape: "repos" } | { etape: "attente" } | { etape: "erreur"; message: string };

/** Écran Connexion : grand logo animé et un seul bouton, « Se connecter avec Steam ». */
export function Connexion() {
  const statut = useSession((s) => s.statut);
  const connecte = useSession((s) => s.connecte);
  const [phase, setPhase] = useState<Phase>({ etape: "repos" });

  if (statut === "pret") return <Navigate to={PATHS.accueil} replace />;
  if (statut === "sans-cle") return <Navigate to={PATHS.cleApi} replace />;

  const lancer = async () => {
    setPhase({ etape: "attente" });
    try {
      const session = await api.connexionSteam();
      await connecte(session.steamId);
    } catch (e) {
      if (estErreurApp(e) && e.code === "annule") setPhase({ etape: "repos" });
      else setPhase({ etape: "erreur", message: estErreurApp(e) ? e.message : String(e) });
    }
  };

  return (
    <EcranPlein>
      <div className="ecran__logo">
        <Logo size={148} />
      </div>
      <span className="kicker">
        <span className="kicker__dot" />
        Vitrine pour Steam
      </span>
      <h1 className="ecran__titre">ResTeaM</h1>
      <p className="ecran__texte">Ta bibliothèque, le magasin et tes amis Steam, dans une vitrine sobre.</p>

      <div className="ecran__actions">
        {phase.etape === "attente" ? (
          <>
            <div className="ecran__attente" role="status">
              <div className="attente-anneau" aria-hidden="true" />
              <div>
                <strong>Termine la connexion dans ton navigateur</strong>
                <span>Steam s’est ouvert dans un onglet. Reviens ici ensuite.</span>
              </div>
            </div>
            <button type="button" className="btn btn--secondaire btn--petit" onClick={() => void api.connexionAnnuler()}>
              Annuler
            </button>
          </>
        ) : (
          <>
            {phase.etape === "erreur" && <p className="message">{phase.message}</p>}
            <button type="button" className="btn btn--principal" onClick={lancer}>
              {phase.etape === "erreur" ? "Réessayer" : "Se connecter avec Steam"}
            </button>
          </>
        )}
        <p className="ecran__note">
          La connexion se fait sur le site officiel de Steam, dans ton navigateur. ResTeaM ne voit jamais ton mot de
          passe.
        </p>
      </div>
    </EcranPlein>
  );
}
