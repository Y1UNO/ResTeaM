import type React from "react";
import { useEffect, useState } from "react";
import type { Palette } from "../../lib/couleurs";

/**
 * Lueurs aux couleurs de l'affiche : elles passent sous la barre de gauche,
 * derrière le hero et continuent sous le ruban, puis se fondent dans le noir.
 * Les couleurs glissent d'un jeu à l'autre (transition douce).
 */
export function Lueurs({ palette }: { palette: Palette }) {
  return (
    <div
      aria-hidden="true"
      className="lueurs"
      style={{ "--c1": palette[0], "--c2": palette[1], "--c3": palette[2] } as React.CSSProperties}
    >
      <div className="lueurs__tache lueurs__tache--1" />
      <div className="lueurs__tache lueurs__tache--2" />
      <div className="lueurs__tache lueurs__tache--3" />
      <div className="lueurs__fond" />
    </div>
  );
}

/**
 * Affiche du jeu (visuel `library_hero` en 3840 px), resserrée à droite : elle ne
 * passe pas sous la barre de gauche. Ses bords gauche et bas se fondent dans les
 * lueurs à travers une brume douce.
 */
export function Affiche({ url, appId }: { url: string | null; appId: number }) {
  const [prete, setPrete] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let annule = false;
    const img = new Image();
    img.onload = () => !annule && setPrete(url);
    img.src = url;
    return () => {
      annule = true;
    };
  }, [url]);

  return (
    <div aria-hidden="true" className="affiche">
      {url && prete === url && (
        <div key={appId} className="affiche__image" style={{ backgroundImage: `url("${url}")` }} />
      )}
      <div className="affiche__brume affiche__brume--gauche" />
      <div className="affiche__brume affiche__brume--bas" />
    </div>
  );
}
