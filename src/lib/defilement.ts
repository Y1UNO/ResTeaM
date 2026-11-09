/**
 * Défilement plus fluide (demande de Tom) : pendant que la page défile, la classe
 * `defile` met en pause les animations de décor et coupe les effets de survol
 * (qui repeindraient des cartes sous le curseur à chaque image). Elle disparaît
 * 160 ms après le dernier mouvement.
 */
let installe = false;

export function installerDefilementFluide() {
  if (installe || typeof window === "undefined") return;
  installe = true;
  const racine = document.documentElement;
  let minuterie = 0;
  window.addEventListener(
    "scroll",
    () => {
      if (!racine.classList.contains("defile")) racine.classList.add("defile");
      window.clearTimeout(minuterie);
      minuterie = window.setTimeout(() => racine.classList.remove("defile"), 160);
    },
    { passive: true, capture: true },
  );
}
