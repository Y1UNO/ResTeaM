import { useEffect, type RefObject } from "react";

/**
 * Molette verticale → défilement horizontal doux d'une rangée (rubans de jaquettes).
 * Aux bords, la molette rend la main à la page pour continuer à descendre.
 */
export function useMoletteHorizontale(ref: RefObject<HTMLElement | null>, cle?: unknown) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    /** Position visée : les crans rapides s'additionnent au lieu de repartir de zéro. */
    let cible: number | null = null;
    let fin = 0;

    const roue = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const depart = cible ?? el.scrollLeft;
      const pas = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
      const suivante = Math.max(0, Math.min(max, depart + pas * 1.4));
      // Déjà au bord dans ce sens : la page défile normalement.
      if (Math.abs(suivante - depart) < 1) return;
      e.preventDefault();
      cible = suivante;
      el.scrollTo({ left: suivante, behavior: "smooth" });
      window.clearTimeout(fin);
      fin = window.setTimeout(() => (cible = null), 350);
    };

    el.addEventListener("wheel", roue, { passive: false });
    return () => {
      el.removeEventListener("wheel", roue);
      window.clearTimeout(fin);
    };
  }, [ref, cle]);
}
