/**
 * Journal des sessions : calculs du calendrier des « nuits de jeu ».
 * Une partie commencée avant 6 h du matin compte pour la nuit d'avant (jouer de
 * 23 h à 2 h, c'est une seule nuit de jeu).
 */
import type { SessionJeu } from "../api/types";

export const HEURE_BASCULE = 6;
const JOUR_MS = 86_400_000;

/** Clé `AAAA-MM-JJ` (heure locale) de la nuit de jeu d'un instant. */
export function nuitDe(ms: number): string {
  const d = new Date(ms);
  if (d.getHours() < HEURE_BASCULE) d.setDate(d.getDate() - 1);
  return cleJour(d);
}

export function cleJour(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dateDeCle(cle: string): Date {
  const [a, m, j] = cle.split("-").map(Number);
  return new Date(a, m - 1, j);
}

export const dureeMs = (s: SessionJeu) => Math.max(0, (s.fin ?? Date.now()) - s.debut);

export type Nuit = { cle: string; minutes: number; sessions: SessionJeu[] };

export function parNuit(sessions: SessionJeu[]): Map<string, Nuit> {
  const m = new Map<string, Nuit>();
  for (const s of sessions) {
    const cle = nuitDe(s.debut);
    const n = m.get(cle) ?? { cle, minutes: 0, sessions: [] };
    n.minutes += dureeMs(s) / 60_000;
    n.sessions.push(s);
    m.set(cle, n);
  }
  return m;
}

/** Intensité d'une case : 0 (pas joué) à 5 (4 h et plus). */
export function intensite(minutes: number): number {
  if (minutes <= 0) return 0;
  if (minutes < 30) return 1;
  if (minutes < 60) return 2;
  if (minutes < 120) return 3;
  if (minutes < 240) return 4;
  return 5;
}

export type Bilan = {
  minutes: number;
  nuits: number;
  sessions: number;
  plusLongue: SessionJeu | null;
  /** Jeu le plus joué (minutes). */
  favori: { appId: number; minutes: number } | null;
  /** Plus longue série de nuits de jeu d'affilée. */
  serie: number;
  /** Série en cours (jusqu'à aujourd'hui ou hier). */
  serieActuelle: number;
  parJeu: { appId: number; minutes: number }[];
};

export function bilan(sessions: SessionJeu[], aujourdhui = new Date()): Bilan {
  const nuits = parNuit(sessions);
  const parJeu = new Map<number, number>();
  let plusLongue: SessionJeu | null = null;
  let minutes = 0;
  for (const s of sessions) {
    const m = dureeMs(s) / 60_000;
    minutes += m;
    parJeu.set(s.appId, (parJeu.get(s.appId) ?? 0) + m);
    if (!plusLongue || dureeMs(s) > dureeMs(plusLongue)) plusLongue = s;
  }
  const jeux = [...parJeu.entries()].map(([appId, m]) => ({ appId, minutes: m })).sort((a, b) => b.minutes - a.minutes);
  // Séries : nuits consécutives.
  const cles = [...nuits.keys()].sort();
  let serie = 0;
  let courante = 0;
  let precedente: Date | null = null;
  for (const c of cles) {
    const d = dateDeCle(c);
    courante = precedente && Math.round((d.getTime() - precedente.getTime()) / JOUR_MS) === 1 ? courante + 1 : 1;
    serie = Math.max(serie, courante);
    precedente = d;
  }
  let serieActuelle = 0;
  const jour = new Date(aujourdhui);
  if (aujourdhui.getHours() < HEURE_BASCULE) jour.setDate(jour.getDate() - 1);
  // La série continue si on a joué cette nuit, ou la nuit d'avant (la soirée n'est pas finie).
  if (!nuits.has(cleJour(jour))) jour.setDate(jour.getDate() - 1);
  while (nuits.has(cleJour(jour))) {
    serieActuelle++;
    jour.setDate(jour.getDate() - 1);
  }
  return {
    minutes,
    nuits: nuits.size,
    sessions: sessions.length,
    plusLongue,
    favori: jeux[0] ?? null,
    serie,
    serieActuelle,
    parJeu: jeux,
  };
}

/** Semaines (du lundi au dimanche) qui couvrent la période, pour la grille du calendrier. */
export function semaines(depuis: Date, jusqu: Date): Date[][] {
  const debut = new Date(depuis.getFullYear(), depuis.getMonth(), depuis.getDate());
  debut.setDate(debut.getDate() - ((debut.getDay() + 6) % 7));
  const fin = new Date(jusqu.getFullYear(), jusqu.getMonth(), jusqu.getDate());
  const liste: Date[][] = [];
  const d = new Date(debut);
  while (d <= fin) {
    const semaine: Date[] = [];
    for (let i = 0; i < 7; i++) {
      semaine.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    liste.push(semaine);
  }
  return liste;
}

/** « 2 h 05 », « 45 min ». */
export function duree(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, "0")}`;
}
