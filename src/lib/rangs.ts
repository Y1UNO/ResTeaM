/**
 * Rangs de temps de jeu par jeu (kit/FONCTIONNALITES.md) : de Novice (0 h) à Éternel (10 000 h).
 * Jauge à 9 segments : les paliers atteints sont pleins, le palier en cours se remplit au prorata.
 */

export const PALIERS = [10, 50, 100, 250, 500, 1000, 2000, 5000, 10000] as const;
export const NOMS_RANGS = ["Éveillé", "Initié", "Habitué", "Vétéran", "Expert", "Maître", "Légende", "Mythe", "Éternel"] as const;
export const ROMAINS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"] as const;

export type Rang = {
  /** 0 = Novice, 1 à 9 = rangs I à IX. */
  niveau: number;
  nom: string;
  /** « 0 » pour Novice, sinon chiffre romain. */
  romain: string;
  /** Remplissage de chaque segment, de 0 à 1. */
  segments: number[];
  /** Prochain palier, ou `null` au rang maximum. */
  prochain: { nom: string; heures: number; reste: number } | null;
};

export function rangDepuisHeures(heures: number): Rang {
  const h = Math.max(0, heures);
  const niveau = PALIERS.filter((p) => h >= p).length;
  const segments = PALIERS.map((p, i) => {
    const debut = i === 0 ? 0 : PALIERS[i - 1];
    if (i < niveau) return 1;
    if (i === niveau) return Math.min(1, Math.max(0, (h - debut) / (p - debut)));
    return 0;
  });
  return {
    niveau,
    nom: niveau === 0 ? "Novice" : NOMS_RANGS[niveau - 1],
    romain: niveau === 0 ? "0" : ROMAINS[niveau - 1],
    segments,
    prochain:
      niveau >= PALIERS.length
        ? null
        : { nom: NOMS_RANGS[niveau], heures: PALIERS[niveau], reste: Math.round((PALIERS[niveau] - h) * 10) / 10 },
  };
}

export const rangDepuisMinutes = (minutes: number) => rangDepuisHeures(minutes / 60);
