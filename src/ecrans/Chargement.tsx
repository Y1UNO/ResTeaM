import { Logo } from "../components/Logo";
import { EcranPlein } from "./EcranPlein";

/** Démarrage : lecture de la session. Le logo n'apparaît que si ça dure un peu. */
export function Chargement() {
  return (
    <EcranPlein>
      <div className="chargement__logo" role="status" aria-label="Chargement de ResTeaM">
        <Logo size={120} />
      </div>
    </EcranPlein>
  );
}
