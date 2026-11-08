import { HeroBackdrop } from "../components/HeroBackdrop";
import "./pages.css";

/**
 * Accueil (maquette 01). À l'étape 1, seul le fond du hero est posé :
 * dégradé de remplacement flouté, voile noir de gauche à droite, fumée en bas.
 * Le jeu en vedette, la jaquette et le ruban arrivent à l'étape 3.
 */
export function Accueil() {
  return (
    <section aria-label="Accueil" className="hero">
      <HeroBackdrop />
      <div className="hero__content">
        <div className="hero__text">
          <span className="kicker">
            <span className="kicker__dot" />
            Accueil
          </span>
          <h1 className="hero__title">ResTeaM</h1>
          <span className="placeholder-note">Le jeu en vedette arrive à l’étape 3.</span>
        </div>
      </div>
    </section>
  );
}
