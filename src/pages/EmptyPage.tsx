import { Smoke } from "../components/Smoke";
import "./pages.css";

type EmptyPageProps = {
  title: string;
  /** Étape du plan où la page sera construite. */
  step: string;
};

/** Page vide de l'étape 1 : fond fumé en haut de page et titre, dans la DA. */
export function EmptyPage({ title, step }: EmptyPageProps) {
  return (
    <div className="page">
      <Smoke variant="top" />
      <div className="page__content">
        <header className="page__header">
          <h1 className="page__title">{title}</h1>
          <span className="placeholder-note">Page vide · construite à l’étape {step}</span>
        </header>
      </div>
    </div>
  );
}
