import type { ConfigPc, LigneConfig } from "../api/types";
import { taille } from "./format";

/** Verdict d'une ligne de configuration face à ce PC. */
export type Verdict = "ok" | "court" | "indicatif";

export type Comparaison = { pc: string; verdict: Verdict };

const GO = 1024 ** 3;

/** « 8 GB de mémoire », « 16 Go », « 512 MB » → octets. */
export function octetsDepuis(texte: string): number | null {
  const m = texte.match(/(\d+(?:[.,]\d+)?)\s*(TB|To|GB|Go|MB|Mo)\b/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  const u = m[2].toUpperCase();
  const facteur = u.startsWith("T") ? 1024 * GO : u.startsWith("G") ? GO : 1024 ** 2;
  return n * facteur;
}

function versionWindows(texte: string): number | null {
  const m = texte.match(/Windows\s*(\d{1,2})\b/i);
  return m ? Number(m[1]) : null;
}

type Genre = "systeme" | "processeur" | "memoire" | "graphique" | "disque" | "autre";

export function genreLigne(cle: string): Genre {
  const k = cle.toLowerCase();
  if (/graphi|carte|vid[ée]o|gpu|direct ?x/.test(k)) return /direct ?x/.test(k) ? "autre" : "graphique";
  if (/syst[èe]me|\bos\b|operating/.test(k)) return "systeme";
  if (/processeur|processor|cpu/.test(k)) return "processeur";
  if (/m[ée]moire|memory|\bram\b/.test(k)) return "memoire";
  if (/espace|stockage|storage|disque/.test(k)) return "disque";
  return "autre";
}

/**
 * Compare une ligne de la configuration requise à ce PC. Fiable pour Windows,
 * la mémoire vive, la mémoire graphique et l'espace disque ; indicatif pour le
 * processeur et la carte graphique (pas de base de performances).
 */
export function comparer(ligne: LigneConfig, pc: ConfigPc): Comparaison | null {
  switch (genreLigne(ligne.cle)) {
    case "systeme": {
      const voulu = versionWindows(ligne.valeur);
      const nous = versionWindows(pc.systeme);
      if (voulu == null || nous == null) return { pc: pc.systeme, verdict: "indicatif" };
      return { pc: pc.systeme, verdict: nous >= voulu ? "ok" : "court" };
    }
    case "memoire": {
      const voulu = octetsDepuis(ligne.valeur);
      const texte = `${Math.round(pc.memoire / GO)} Go`;
      if (voulu == null) return { pc: texte, verdict: "indicatif" };
      // Windows annonce un peu moins que la barrette (mémoire réservée) : 5 % de tolérance.
      return { pc: texte, verdict: pc.memoire >= voulu * 0.95 ? "ok" : "court" };
    }
    case "graphique": {
      const nom = pc.carteGraphique ?? "Carte graphique inconnue";
      const vram = pc.memoireGraphique ? ` · ${Math.round(pc.memoireGraphique / GO)} Go` : "";
      const voulu = /vram|m[ée]moire/i.test(ligne.valeur) ? octetsDepuis(ligne.valeur) : null;
      if (voulu != null && pc.memoireGraphique)
        return { pc: nom + vram, verdict: pc.memoireGraphique >= voulu * 0.95 ? "ok" : "court" };
      return { pc: nom + vram, verdict: "indicatif" };
    }
    case "processeur":
      return { pc: `${pc.processeur}${pc.coeurs ? ` · ${pc.coeurs} threads` : ""}`, verdict: "indicatif" };
    case "disque": {
      const voulu = octetsDepuis(ligne.valeur);
      const texte = `${taille(pc.espaceLibreMax)} libres`;
      if (voulu == null) return { pc: texte, verdict: "indicatif" };
      return { pc: texte, verdict: pc.espaceLibreMax >= voulu ? "ok" : "court" };
    }
    default:
      return null;
  }
}

/** Bilan : le PC suit-il la configuration (toutes les lignes fiables à « ok ») ? */
export function bilan(lignes: LigneConfig[], pc: ConfigPc): Verdict {
  const v = lignes.map((l) => comparer(l, pc)?.verdict).filter((x): x is Verdict => !!x && x !== "indicatif");
  if (v.length === 0) return "indicatif";
  return v.every((x) => x === "ok") ? "ok" : "court";
}
