import "./grimoire.css";

/**
 * Carnet magique lunaire, en grand et animé (bouton des notes de mise à jour de
 * l'accueil, demande de Tom). Au repos : il flotte, la lune de la couverture se
 * balance, l'étincelle scintille, et de temps en temps la couverture s'entrouvre.
 * Au survol du bouton : il s'ouvre et ses pages défilent, avec un peu de poussière
 * d'étoiles. Tout en CSS (transform et opacité seulement).
 */
export function CarnetMagique() {
  return (
    <span className="grimoire" aria-hidden="true">
      <span className="grimoire__halo" />
      <span className="grimoire__livre">
        <span className="grimoire__dos" />
        <span className="grimoire__bloc" />
        <span className="grimoire__feuille" />
        <span className="grimoire__feuille" />
        <span className="grimoire__feuille" />
        <span className="grimoire__feuille" />
        <span className="grimoire__couverture">
          <span className="grimoire__face">
            <svg className="grimoire__lune" viewBox="0 0 24 24" width="12" height="12">
              <path d="M13 3.2a8.8 8.8 0 1 0 7.8 12.9A7.2 7.2 0 1 1 13 3.2z" fill="currentColor" />
            </svg>
          </span>
          <span className="grimoire__envers" />
        </span>
        <span className="grimoire__spirale" />
      </span>
      <svg className="grimoire__eclat" viewBox="0 0 10 10" width="9" height="9">
        <path d="M5 0l1.1 3.9L10 5 6.1 6.1 5 10 3.9 6.1 0 5l3.9-1.1z" fill="currentColor" />
      </svg>
      <span className="grimoire__poussiere" />
      <span className="grimoire__poussiere" />
      <span className="grimoire__poussiere" />
    </span>
  );
}
