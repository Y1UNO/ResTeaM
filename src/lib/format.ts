/** Formats en français : heures, tailles, dates relatives. */

const nombre = new Intl.NumberFormat("fr-FR");
const uneDecimale = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** 48 h · 7,3 h · 1 265 h (une décimale en dessous de 10 h). */
export function heures(minutes: number): string {
  const h = minutes / 60;
  if (h === 0) return "0 h";
  return `${h < 10 ? uneDecimale.format(h) : nombre.format(Math.round(h))} h`;
}

/** 11,8 Go · 183 Mo. */
export function taille(octets: number): string {
  const unites = ["o", "Ko", "Mo", "Go", "To"];
  let v = octets;
  let i = 0;
  while (v >= 1000 && i < unites.length - 1) {
    v /= 1000;
    i++;
  }
  return `${v < 10 && i > 0 ? uneDecimale.format(v) : nombre.format(Math.round(v))} ${unites[i]}`;
}

export const entier = (n: number) => nombre.format(n);
export const pourcentage = (fraction: number) => `${Math.round(fraction * 100)} %`;

const jourMois = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const jourMoisAnnee = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/** « 8 nov. » cette année, « 8 nov. 2024 » sinon. Entrée en secondes depuis 1970. */
export function date(secondes: number): string {
  const d = new Date(secondes * 1000);
  return (d.getFullYear() === new Date().getFullYear() ? jourMois : jourMoisAnnee).format(d);
}

/**
 * « à l’instant », « il y a 7 min », « il y a 46 h », « il y a 4 j », puis la date.
 * `long` : « il y a 3 jours », « il y a 5 heures » (en-têtes).
 */
export function ilYA(secondes: number, long = false): string {
  const ecart = Math.max(0, Date.now() / 1000 - secondes);
  const pluriel = (n: number, mot: string) => `il y a ${n} ${mot}${n > 1 ? "s" : ""}`;
  if (ecart < 60) return "à l’instant";
  if (ecart < 3600) return `il y a ${Math.floor(ecart / 60)} min`;
  if (ecart < 48 * 3600) {
    const h = Math.floor(ecart / 3600);
    return long ? pluriel(h, "heure") : `il y a ${h} h`;
  }
  if (ecart < 30 * 86400) {
    const j = Math.floor(ecart / 86400);
    return long ? pluriel(j, "jour") : `il y a ${j} j`;
  }
  return date(secondes);
}

/** Libellé du statut Steam d'un joueur. */
export function statut(etat: number, jeu: string | null): string {
  if (jeu) return jeu;
  return ["Hors ligne", "En ligne", "Occupé", "Absent", "En veille", "Veut échanger", "Veut jouer"][etat] ?? "En ligne";
}
