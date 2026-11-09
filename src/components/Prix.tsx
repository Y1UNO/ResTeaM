import { useEffect, useRef, useState } from "react";
import "./Prix.css";

const euros = (centimes: number) => `${Math.floor(centimes / 100)},${String(Math.round(centimes) % 100).padStart(2, "0")} €`;

/** Vrai dès que l'élément entre à l'écran (une seule fois) : l'animation part au bon moment. */
function useVu<T extends Element>() {
  const ref = useRef<T>(null);
  const [vu, setVu] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || vu) return;
    if (typeof IntersectionObserver === "undefined") {
      setVu(true);
      return;
    }
    const o = new IntersectionObserver(
      (e) => {
        if (e.some((x) => x.isIntersecting)) {
          setVu(true);
          o.disconnect();
        }
      },
      { rootMargin: "60px" },
    );
    o.observe(el);
    // Filet de sécurité : si l'observateur ne répond pas (fenêtre cachée), on
    // anime quand même, pour ne jamais rester sur un prix faux.
    const secours = window.setTimeout(() => setVu(true), 1500);
    return () => {
      o.disconnect();
      window.clearTimeout(secours);
    };
  }, [vu]);
  return { ref, vu };
}

/**
 * Montant qui défile jusqu'à sa valeur (demande de Tom : « tous les chiffres
 * défilent avant d'arriver »). Part de `depuis` (0 ou l'ancien prix).
 */
export function MontantDefilant({ centimes, depuis = 0, delai = 0, duree = 900 }: { centimes: number; depuis?: number; delai?: number; duree?: number }) {
  const { ref, vu } = useVu<HTMLSpanElement>();
  const [valeur, setValeur] = useState(depuis);
  useEffect(() => {
    if (!vu) return;
    let anim = 0;
    let t0 = 0;
    const pas = (t: number) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / duree);
      const e = 1 - Math.pow(1 - p, 4);
      setValeur(depuis + (centimes - depuis) * e);
      if (p < 1) anim = requestAnimationFrame(pas);
    };
    const debut = window.setTimeout(() => (anim = requestAnimationFrame(pas)), delai);
    // Si l'animation ne peut pas tourner (fenêtre cachée), la vraie valeur s'affiche.
    const secours = window.setTimeout(() => setValeur(centimes), delai + duree + 200);
    return () => {
      window.clearTimeout(debut);
      window.clearTimeout(secours);
      cancelAnimationFrame(anim);
    };
  }, [vu, centimes, depuis, delai, duree]);
  return (
    <span ref={ref} className="montant">
      {euros(valeur)}
    </span>
  );
}

/** Pastille de réduction rouge, vivante (elle pulse et un reflet la traverse). */
export function Reduction({ pourcent, grand = false }: { pourcent: number; grand?: boolean }) {
  return <span className={`reduction${grand ? " is-grand" : ""}`}>−{pourcent} %</span>;
}

/**
 * Prix en promo : l'ancien prix se fissure et se brise en deux, puis le prix
 * promo défile depuis l'ancien jusqu'au nouveau.
 */
export function PrixPromo({ initial, final_, grand = false }: { initial: number; final_: number; grand?: boolean }) {
  const { ref, vu } = useVu<HTMLSpanElement>();
  const ancien = euros(initial);
  return (
    <span ref={ref} className={`prix-promo${grand ? " is-grand" : ""}${vu ? " is-vu" : ""}`}>
      <span className="prix-promo__ancien" aria-label={`au lieu de ${ancien}`}>
        <span className="prix-promo__moitie is-gauche">{ancien}</span>
        <span className="prix-promo__moitie is-droite" aria-hidden="true">
          {ancien}
        </span>
        <span className="prix-promo__fissure" aria-hidden="true" />
      </span>
      <strong className="prix-promo__nouveau">{vu ? <MontantDefilant centimes={final_} depuis={initial} delai={520} duree={850} /> : ancien}</strong>
    </span>
  );
}

/** Panier dont les articles sautillent (bouton « Acheter sur Steam »). */
export function IconePanier({ taille = 18 }: { taille?: number }) {
  return (
    <svg className="icone-panier" width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect className="icone-panier__article a1" x="8" y="7" width="3.4" height="3.4" rx="0.6" fill="currentColor" stroke="none" />
      <rect className="icone-panier__article a2" x="12.4" y="5.6" width="3" height="4.8" rx="0.6" fill="currentColor" stroke="none" opacity="0.75" />
      <circle className="icone-panier__article a3" cx="17.2" cy="8.6" r="1.7" fill="currentColor" stroke="none" opacity="0.55" />
      <path d="M2.5 3.5h2.4l2.3 10.6a1.6 1.6 0 0 0 1.6 1.3h8.6a1.6 1.6 0 0 0 1.6-1.2l1.5-5.7" />
      <path d="M6 11h13.4" opacity="0.5" />
      <circle cx="9.5" cy="19.5" r="1.4" />
      <circle cx="17" cy="19.5" r="1.4" />
    </svg>
  );
}
