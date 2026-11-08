import type { ImagesJeu } from "../api/types";

const CDN = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";

/** Images d'un jeu : celles du magasin si connues, sinon les adresses classiques. */
export function imagesDe(appId: number, toutes?: Record<string, ImagesJeu>): ImagesJeu {
  const i = toutes?.[String(appId)];
  return {
    jaquette: i?.jaquette ?? `${CDN}/${appId}/library_600x900.jpg`,
    hero: i?.hero ?? `${CDN}/${appId}/library_hero_2x.jpg`,
    banniere: i?.banniere ?? `${CDN}/${appId}/header.jpg`,
  };
}

/** Teinte stable tirée du nom (dégradé de remplacement quand l'image manque). */
export function teinte(nom: string): number {
  let h = 0;
  for (let i = 0; i < nom.length; i++) h = (h * 31 + nom.charCodeAt(i)) % 360;
  return h;
}

/** Dégradé de remplacement d'une jaquette (maquette 03). */
export function degradeJaquette(nom: string): string {
  const h = teinte(nom);
  return `linear-gradient(160deg, hsl(${h},38%,30%) 0%, hsl(${h},30%,16%) 55%, #101012 100%)`;
}

/** Dégradé de remplacement du fond du hero (maquette 01). */
export function degradeHero(nom: string): string {
  const h = teinte(nom);
  return `radial-gradient(ellipse at 65% 35%, hsla(${h},50%,36%,.75), hsla(${h},50%,36%,.2) 55%, #0E0E10 100%)`;
}
