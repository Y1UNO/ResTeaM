import { useEffect, useState } from "react";
import { useNomJeu } from "../api/requetes";
import { duree, useChrono, useSessionJeu } from "./sessionJeu";
import "./PastilleJeu.css";

/**
 * Pastille en bas de la fenêtre : « En cours · Hades II · 12:34 » pendant qu'un jeu
 * tourne, puis « Session terminée · 1 h 12 » pendant quelques secondes.
 */
export function PastilleJeu() {
  const enCours = useSessionJeu((s) => s.enCours);
  const derniere = useSessionJeu((s) => s.derniere);
  const chrono = useChrono(enCours?.debut);
  const nomEnCours = useNomJeu(enCours?.appId);
  const nomDernier = useNomJeu(derniere?.appId);

  // La fin d'une session reste affichée 8 s (seulement si elle vient de se terminer).
  const [finVisible, setFinVisible] = useState(false);
  useEffect(() => {
    if (!derniere?.fin || Date.now() - derniere.fin > 10_000) return;
    setFinVisible(true);
    const t = window.setTimeout(() => setFinVisible(false), 8000);
    return () => window.clearTimeout(t);
  }, [derniere?.fin]);

  if (enCours) {
    return (
      <div className="pastille-jeu" role="status">
        <span className="pastille-jeu__lune" aria-hidden="true" />
        <span className="pastille-jeu__etiquette">En cours</span>
        <strong>{nomEnCours ?? `Jeu ${enCours.appId}`}</strong>
        <span className="pastille-jeu__chrono">{chrono}</span>
      </div>
    );
  }
  if (finVisible && derniere?.fin) {
    return (
      <div className="pastille-jeu pastille-jeu--fin" role="status">
        <span className="pastille-jeu__lune" aria-hidden="true" />
        <span className="pastille-jeu__etiquette">Session terminée</span>
        <strong>{nomDernier ?? `Jeu ${derniere.appId}`}</strong>
        <span className="pastille-jeu__chrono">{duree(derniere.fin - derniere.debut)}</span>
      </div>
    );
  }
  return null;
}
