import { Smoke } from "./Smoke";
import "./HeroBackdrop.css";

/**
 * Teinte de remplacement de la maquette 01 (jeu en vedette « Hades II »).
 * À l'étape 3, elle est remplacée par la vraie image `library_hero` floutée.
 */
export const PLACEHOLDER_TINT = "#2E8A6E";

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Dégradé de remplacement d'une image de jeu (identique à la maquette). */
export function placeholderArt(hex: string) {
  return `radial-gradient(ellipse at 65% 35%, ${rgba(hex, 0.75)}, ${rgba(hex, 0.2)} 55%, #0E0E10 100%)`;
}

type HeroBackdropProps = {
  /** URL de l'image du jeu. Sans image, on affiche le dégradé de remplacement. */
  image?: string;
  tint?: string;
  /** Change à chaque nouveau jeu en vedette pour rejouer le fondu + zoom. */
  artKey?: string;
};

/**
 * Fond du hero de la maquette 01 : image du jeu floutée, dégradé noir
 * de gauche à droite pour la lisibilité, fumée monochrome en bas.
 */
export function HeroBackdrop({ image, tint = PLACEHOLDER_TINT, artKey }: HeroBackdropProps) {
  const background = image
    ? `url("${image}") center / cover no-repeat`
    : placeholderArt(tint);
  return (
    <>
      <div key={artKey} aria-hidden="true" className="hero-backdrop__art" style={{ background }} />
      <div aria-hidden="true" className="hero-backdrop__shade" />
      <Smoke variant="hero" />
    </>
  );
}
