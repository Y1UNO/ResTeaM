/**
 * La vraie lune de ce soir (idée de Tom) : phase calculée sur le PC, sans Internet,
 * avec le mois lunaire moyen (29,53 jours) depuis une nouvelle lune connue
 * (6 janvier 2000, 18 h 14 UTC). Précision : un jour environ, bien assez pour un logo.
 */
import { useEffect, useState } from "react";

const MOIS_LUNAIRE = 29.530588853;
const REFERENCE = Date.UTC(2000, 0, 6, 18, 14);

export type PhaseLune = {
  /** 0 = nouvelle lune, 0,25 = premier quartier, 0,5 = pleine lune, 0,75 = dernier quartier. */
  phase: number;
  /** Part éclairée, de 0 à 1. */
  eclairage: number;
  nom: string;
};

export function phaseLune(date = new Date()): PhaseLune {
  const jours = (date.getTime() - REFERENCE) / 86_400_000;
  const phase = (((jours % MOIS_LUNAIRE) + MOIS_LUNAIRE) % MOIS_LUNAIRE) / MOIS_LUNAIRE;
  return { phase, eclairage: (1 - Math.cos(2 * Math.PI * phase)) / 2, nom: nomPhase(phase) };
}

export function nomPhase(p: number): string {
  if (p < 0.0339 || p >= 0.9661) return "Nouvelle lune";
  if (p < 0.216) return "Premier croissant";
  if (p < 0.284) return "Premier quartier";
  if (p < 0.466) return "Lune gibbeuse croissante";
  if (p < 0.534) return "Pleine lune";
  if (p < 0.716) return "Lune gibbeuse décroissante";
  if (p < 0.784) return "Dernier quartier";
  return "Dernier croissant";
}

/**
 * Chemin SVG de la partie éclairée (vue de l'hémisphère nord : la lune croissante
 * est éclairée à droite). Bord éclairé = demi-cercle ; terminateur = demi-ellipse.
 */
export function cheminEclaire(p: number, cx: number, cy: number, r: number): string {
  const croissante = p < 0.5;
  const c = Math.cos(2 * Math.PI * p);
  const rx = Math.abs(c) * r;
  const haut = `${cx} ${cy - r}`;
  const bas = `${cx} ${cy + r}`;
  // Bord éclairé : à droite (croissante) ou à gauche (décroissante).
  const bord = `A ${r} ${r} 0 0 ${croissante ? 1 : 0} ${bas}`;
  // Terminateur : bombé vers le bord éclairé (croissant) ou vers l'autre côté (gibbeuse).
  const sens = croissante ? (c < 0 ? 1 : 0) : c > 0 ? 1 : 0;
  return `M ${haut} ${bord} A ${rx.toFixed(2)} ${r} 0 0 ${sens} ${haut} Z`;
}

/** Phase de ce soir, recalculée toutes les 30 minutes. */
export function usePhaseLune(): PhaseLune {
  const [p, setP] = useState(() => phaseLune());
  useEffect(() => {
    const t = window.setInterval(() => setP(phaseLune()), 30 * 60_000);
    return () => window.clearInterval(t);
  }, []);
  return p;
}
