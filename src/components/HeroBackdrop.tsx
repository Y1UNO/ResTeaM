import { useEffect, useState } from "react";
import { Smoke } from "./Smoke";
import "./HeroBackdrop.css";

/**
 * Teinte de remplacement de la maquette 01 (jeu en vedette « Hades II »).
 * Utilisée seulement tant qu'aucune image n'est disponible.
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
  /** URL de l'image du jeu (`library_hero`). */
  image?: string | null;
  /** Fond à afficher si l'image manque ou ne charge pas. */
  repli?: string;
  /** Change à chaque nouveau jeu en vedette pour rejouer le fondu + zoom. */
  artKey?: string | number;
};

/**
 * Fond du hero : image du jeu nette (sans flou, décision de Tom), dégradé noir
 * de gauche à droite pour la lisibilité, fumée monochrome en bas.
 * L'image est préchargée : le fondu ne démarre qu'une fois qu'elle est prête.
 */
export function HeroBackdrop({ image, repli = placeholderArt(PLACEHOLDER_TINT), artKey }: HeroBackdropProps) {
  const [pret, setPret] = useState<string | null>(null);
  const [rate, setRate] = useState(false);

  useEffect(() => {
    setRate(false);
    if (!image) return;
    let annule = false;
    const img = new Image();
    img.onload = () => !annule && setPret(image);
    img.onerror = () => !annule && setRate(true);
    img.src = image;
    return () => {
      annule = true;
    };
  }, [image]);

  const afficheImage = image && pret === image && !rate;
  const enAttente = image && !afficheImage && !rate;
  const background = afficheImage ? `url("${image}") center 30% / cover no-repeat` : repli;

  return (
    <>
      {!enAttente && (
        <div
          key={`${artKey ?? ""}-${afficheImage ? "img" : "repli"}`}
          aria-hidden="true"
          className="hero-backdrop__art"
          style={{ background }}
        />
      )}
      <div aria-hidden="true" className="hero-backdrop__shade" />
      <Smoke variant="hero" />
    </>
  );
}
