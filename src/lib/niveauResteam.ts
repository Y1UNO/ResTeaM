/**
 * Niveau ResTeaM de 1 à 30 (lune du profil), calculé avec des points :
 * - 1 point par trophée ;
 * - 1 point par heure de jeu ;
 * - 50 points par jeu terminé à 100 % ;
 * - 10 points par rang atteint sur chaque jeu (Éveillé = 1 rang… Éternel = 9).
 * La courbe s'allonge : le niveau 10 demande ~1 900 points, le 20 ~9 900, le 30 25 000.
 * Barème à valider avec Tom (il suffit de changer les constantes ci-dessous).
 */
import { rangDepuisMinutes } from "./rangs";

export const POINTS_PAR_TROPHEE = 1;
export const POINTS_PAR_HEURE = 1;
export const POINTS_PAR_JEU_COMPLET = 50;
export const POINTS_PAR_RANG = 10;
export const NIVEAU_MAX = 30;
const POINTS_NIVEAU_MAX = 25_000;
const COURBE = 2.2;

/** Points nécessaires pour atteindre chaque niveau (indice 0 = niveau 1 = 0 point). */
export const SEUILS: number[] = Array.from({ length: NIVEAU_MAX }, (_, i) =>
  i === 0 ? 0 : Math.round(POINTS_NIVEAU_MAX * Math.pow(i / (NIVEAU_MAX - 1), COURBE)),
);

export type Points = { trophees: number; heures: number; complets: number; rangs: number; total: number };

export function calculerPoints(minutesParJeu: number[], trophees: number, jeuxComplets: number): Points {
  const heures = Math.floor(minutesParJeu.reduce((s, m) => s + m, 0) / 60) * POINTS_PAR_HEURE;
  const rangs = minutesParJeu.reduce((s, m) => s + rangDepuisMinutes(m).niveau, 0) * POINTS_PAR_RANG;
  const t = trophees * POINTS_PAR_TROPHEE;
  const c = jeuxComplets * POINTS_PAR_JEU_COMPLET;
  return { trophees: t, heures, complets: c, rangs, total: t + heures + c + rangs };
}

export type NiveauLune = {
  niveau: number;
  points: number;
  /** Progression vers le niveau suivant, de 0 à 1 (1 au niveau 30). */
  fraction: number;
  /** Points qui manquent pour le niveau suivant (0 au niveau 30). */
  reste: number;
};

export function niveauDepuisPoints(points: number): NiveauLune {
  let i = 0;
  while (i + 1 < NIVEAU_MAX && points >= SEUILS[i + 1]) i++;
  const niveau = i + 1;
  if (niveau >= NIVEAU_MAX) return { niveau, points, fraction: 1, reste: 0 };
  const debut = SEUILS[i];
  const fin = SEUILS[i + 1];
  return { niveau, points, fraction: (points - debut) / (fin - debut), reste: fin - points };
}

/** Ce que chaque niveau ajoute à la lune (aperçu des 30 lunes). */
export function nouveauteDuNiveau(n: number): string {
  const paliers: Record<number, string> = {
    1: "La lune de départ",
    5: "Halo qui respire, 3 étoiles autour",
    10: "Anneau en orbite, teinte bleu lunaire",
    15: "Une constellation se dessine autour",
    20: "Lune argentée et aurore",
    25: "Éclipse dorée : couronne de lumière",
    30: "Lune céleste : tout réuni, couleurs qui changent",
  };
  if (paliers[n]) return paliers[n];
  if (n <= 4) return ["", "", "Cratères plus nets", "Première étoile qui scintille", "Halo léger"][n];
  if (n <= 9) return n === 6 ? "Poussière d’étoiles en orbite" : "Plus de poussière d’étoiles, reflets plus vifs";
  if (n <= 14) return n === 11 ? "Deuxième anneau" : "Une petite lune satellite de plus";
  if (n <= 19) return n === 16 ? "Étoiles filantes de temps en temps" : "Halo plus large";
  if (n <= 24) return n === 21 ? "Particules de lumière qui montent" : "Reflets qui tournent";
  return n === 26 ? "Couronne plus vive" : "Vagues de lumière";
}
