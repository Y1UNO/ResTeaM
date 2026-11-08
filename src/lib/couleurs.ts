import { useEffect, useState } from "react";
import { teinte } from "./images";

/** Trois couleurs « r, g, b » tirées de l'affiche, pour les lueurs du fond. */
export type Palette = [string, string, string];

const memoire = new Map<string, Palette>();
const CLE_STOCKAGE = "resteam.palettes";

function lireStockage(): Record<string, Palette> {
  try {
    return JSON.parse(localStorage.getItem(CLE_STOCKAGE) ?? "{}");
  } catch {
    return {};
  }
}

function ecrireStockage(url: string, p: Palette) {
  try {
    const tout = lireStockage();
    tout[url] = p;
    // On garde les 200 dernières affiches.
    const cles = Object.keys(tout);
    for (const c of cles.slice(0, Math.max(0, cles.length - 200))) delete tout[c];
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify(tout));
  } catch {
    /* stockage indisponible : recalcul la prochaine fois */
  }
}

function hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function rgbDepuisHsl(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)).join(", ");
}

/** Palette de repli, tirée du nom du jeu. */
export function paletteDeRepli(nom: string): Palette {
  const h = teinte(nom);
  return [rgbDepuisHsl(h, 0.55, 0.42), rgbDepuisHsl((h + 35) % 360, 0.5, 0.38), rgbDepuisHsl((h + 320) % 360, 0.45, 0.34)];
}

/**
 * Couleurs dominantes : l'image est réduite à 48×16 px, les pixels trop sombres ou
 * trop gris sont écartés, puis on garde les 3 teintes les plus présentes
 * (pondérées par la saturation), recalées à une luminosité de lueur.
 */
function extraire(img: HTMLImageElement): Palette | null {
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 16;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, 48, 16);
  const { data } = ctx.getImageData(0, 0, 48, 16);
  const seaux = new Array(24).fill(0).map(() => ({ poids: 0, r: 0, g: 0, b: 0 }));
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, l] = hsl(data[i], data[i + 1], data[i + 2]);
    if (l < 0.12 || l > 0.92 || s < 0.18) continue;
    const poids = s * (1 - Math.abs(l - 0.5));
    const seau = seaux[Math.floor(h / 15) % 24];
    seau.poids += poids;
    seau.r += data[i] * poids;
    seau.g += data[i + 1] * poids;
    seau.b += data[i + 2] * poids;
  }
  const tries = seaux
    .map((s, i) => ({ ...s, i }))
    .filter((s) => s.poids > 0)
    .sort((a, b) => b.poids - a.poids);
  const choisis: typeof tries = [];
  for (const s of tries) {
    // Teintes assez différentes (au moins 2 seaux d'écart = 30°).
    if (choisis.every((c) => Math.min(Math.abs(c.i - s.i), 24 - Math.abs(c.i - s.i)) >= 2)) choisis.push(s);
    if (choisis.length === 3) break;
  }
  if (choisis.length === 0) return null;
  const couleurs = choisis.map((s) => {
    const [h, sat] = hsl(s.r / s.poids, s.g / s.poids, s.b / s.poids);
    return rgbDepuisHsl(h, Math.max(0.45, Math.min(sat, 0.8)), 0.45);
  });
  while (couleurs.length < 3) couleurs.push(couleurs[couleurs.length - 1]);
  return couleurs as Palette;
}

/** Palette de l'affiche (mise en cache), avec un repli tant qu'elle n'est pas prête. */
export function usePalette(url: string | null, nom: string): Palette {
  const [palette, setPalette] = useState<Palette>(() => (url && memoire.get(url)) || paletteDeRepli(nom));

  useEffect(() => {
    if (!url) {
      setPalette(paletteDeRepli(nom));
      return;
    }
    const connue = memoire.get(url) ?? lireStockage()[url];
    if (connue) {
      memoire.set(url, connue);
      setPalette(connue);
      return;
    }
    let annule = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (annule) return;
      try {
        const p = extraire(img) ?? paletteDeRepli(nom);
        memoire.set(url, p);
        ecrireStockage(url, p);
        setPalette(p);
      } catch {
        setPalette(paletteDeRepli(nom));
      }
    };
    img.onerror = () => !annule && setPalette(paletteDeRepli(nom));
    img.src = url;
    return () => {
      annule = true;
    };
  }, [url, nom]);

  return palette;
}
