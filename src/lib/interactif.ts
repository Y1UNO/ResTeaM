/**
 * Interactions vivantes, branchées une seule fois pour toute l'app (un seul écouteur) :
 * - `data-incline` : l'élément s'incline en 3D vers la souris ;
 * - `data-lueur` : un halo doux suit la souris sur la carte.
 * Les valeurs passent par des variables CSS (`--rx`, `--ry`, `--mx`, `--my`) ;
 * le rendu est dans `styles/interactif.css`.
 */
const INCLINAISON_MAX = 7; // degrés

let installe = false;

export function installerInteractions() {
  if (installe || typeof document === "undefined") return;
  installe = true;
  let actuel: HTMLElement | null = null;
  let derniere: PointerEvent | null = null;
  let prevu = false;

  const relacher = (el: HTMLElement) => {
    el.classList.remove("is-survol");
    el.style.removeProperty("--rx");
    el.style.removeProperty("--ry");
  };

  const appliquer = () => {
    prevu = false;
    const e = derniere;
    if (!e) return;
    const cible = (e.target as Element | null)?.closest?.<HTMLElement>("[data-incline],[data-lueur]") ?? null;
    if (cible !== actuel) {
      if (actuel) relacher(actuel);
      actuel = cible;
      if (cible) cible.classList.add("is-survol");
    }
    if (!cible) return;
    const r = cible.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    cible.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
    cible.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
    if (cible.hasAttribute("data-incline")) {
      cible.style.setProperty("--rx", `${((0.5 - y) * INCLINAISON_MAX * 2).toFixed(2)}deg`);
      cible.style.setProperty("--ry", `${((x - 0.5) * INCLINAISON_MAX * 2).toFixed(2)}deg`);
    }
  };

  document.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "mouse") return;
      derniere = e;
      if (!prevu) {
        prevu = true;
        requestAnimationFrame(appliquer);
      }
    },
    { passive: true },
  );
  document.addEventListener("pointerleave", () => {
    if (actuel) relacher(actuel);
    actuel = null;
  });
}
