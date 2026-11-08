import { api } from "../../api/commandes";
import type { Installation } from "../../api/types";
import { pourcentage, taille } from "../../lib/format";
import { debit, dureeRestante, useVitesse } from "../../lib/telechargement";

type Props = {
  appId: number;
  /** Installation lue sur le disque (null tant que Steam n'a rien créé). */
  installation: Installation | null;
  /** Vrai juste après « Installer », tant que Steam n'a pas commencé. */
  enAttente: boolean;
};

/**
 * Suivi d'une installation lancée depuis ResTeaM : Steam télécharge, l'app lit
 * l'avancement sur le disque (appmanifest) toutes les 2 s et l'affiche ici.
 */
export function SuiviInstallation({ appId, installation, enAttente }: Props) {
  const enCours = installation && (installation.etat === "telechargement" || installation.etat === "enPause");
  const fraction =
    installation && installation.aTelecharger > 0 ? Math.min(1, installation.telecharge / installation.aTelecharger) : 0;
  const vitesse = useVitesse(appId, enCours && installation.etat === "telechargement" ? installation.telecharge : null);

  if (!enCours && !enAttente) return null;

  const titre = !enCours ? "En attente de Steam" : installation.etat === "enPause" ? "En pause" : "Téléchargement";
  const reste =
    enCours && vitesse && vitesse > 0 ? (installation.aTelecharger - installation.telecharge) / vitesse : Infinity;

  return (
    <div className="carte-verre suivi" role="status" aria-live="polite">
      <div className="suivi__haut">
        <strong>{titre}</strong>
        {enCours && installation.aTelecharger > 0 && <span className="suivi__pct">{pourcentage(fraction)}</span>}
      </div>
      <div className={`suivi__barre${enCours ? "" : " is-attente"}`}>
        <div style={enCours ? { width: `${fraction * 100}%` } : undefined} />
      </div>
      <div className="suivi__bas">
        <span>
          {!enCours
            ? "Choisis le disque dans la fenêtre de Steam, le suivi démarre tout seul."
            : installation.aTelecharger > 0
              ? [
                  `${taille(installation.telecharge)} sur ${taille(installation.aTelecharger)}`,
                  installation.etat === "telechargement" && vitesse ? debit(vitesse) : null,
                  installation.etat === "telechargement" ? dureeRestante(reste) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Préparation…"}
        </span>
        <button type="button" className="suivi__lien" onClick={() => void api.steamLien({ type: "telechargements" })}>
          Ouvrir dans Steam
        </button>
      </div>
    </div>
  );
}
