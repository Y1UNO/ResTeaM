import { useState, type FormEvent } from "react";
import { api } from "../api/commandes";
import { estErreurApp } from "../api/types";

type FormulaireCleProps = {
  /** Appelé une fois la clé vérifiée par Steam et enregistrée. */
  onEnregistree: () => void;
  libelle?: string;
};

/**
 * Saisie de la clé Steam Web API. La clé part directement vers le Rust, qui la
 * vérifie auprès de Steam puis la range dans le Gestionnaire d'identifiants Windows.
 * Elle n'est gardée nulle part côté interface : le champ est vidé après l'envoi.
 */
export function FormulaireCle({ onEnregistree, libelle = "Enregistrer" }: FormulaireCleProps) {
  const [cle, setCle] = useState("");
  const [visible, setVisible] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    if (envoi) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await api.cleEnregistrer(cle);
      setCle("");
      onEnregistree();
    } catch (err) {
      setErreur(estErreurApp(err) ? err.message : String(err));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <form className="cle__formulaire" onSubmit={envoyer} autoComplete="off">
      <div className="cle__ligne">
        <label className={`champ${erreur ? " is-erreur" : ""}`}>
          <span className="sr-only">Clé Steam Web API</span>
          <input
            type={visible ? "text" : "password"}
            value={cle}
            onChange={(e) => setCle(e.target.value)}
            placeholder="Colle ta clé ici (32 caractères)"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            maxLength={64}
            aria-invalid={!!erreur}
          />
          <button
            type="button"
            className="champ__oeil"
            aria-label={visible ? "Masquer la clé" : "Afficher la clé"}
            title={visible ? "Masquer la clé" : "Afficher la clé"}
            onClick={() => setVisible((v) => !v)}
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
              {visible && <path d="M4 4l16 16" />}
            </svg>
          </button>
        </label>
        <button type="submit" className="btn btn--principal" disabled={envoi || cle.trim().length === 0}>
          {envoi ? (
            <>
              <span className="attente-anneau attente-anneau--sombre" aria-hidden="true" />
              Vérification…
            </>
          ) : (
            libelle
          )}
        </button>
      </div>
      {erreur && (
        <p className="message" role="alert">
          {erreur}
        </p>
      )}
    </form>
  );
}
