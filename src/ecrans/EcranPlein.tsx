import type { ReactNode } from "react";
import { Smoke } from "../components/Smoke";
import { TitleBar } from "../app/TitleBar";
import "./ecrans.css";

type EcranPleinProps = {
  children: ReactNode;
  /** Largeur du contenu centré. */
  large?: boolean;
};

/**
 * Cadre des écrans sans barre de gauche (Chargement, Connexion, Clé API) :
 * fond Nocturne, fumée en haut et en bas, contenu centré, boutons de fenêtre.
 */
export function EcranPlein({ children, large = false }: EcranPleinProps) {
  return (
    <div className="ecran">
      <TitleBar pleinEcran />
      <Smoke variant="top" />
      <div aria-hidden="true" className="ecran__fumee-bas">
        <Smoke variant="hero" />
      </div>
      <main className={`ecran__centre${large ? " ecran__centre--large" : ""}`}>{children}</main>
    </div>
  );
}
