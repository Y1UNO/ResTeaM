import { useEffect, useRef, useState } from "react";

/**
 * Vitesse de téléchargement (octets/s), calculée entre deux lectures successives
 * de l'`appmanifest` et lissée pour ne pas sauter d'une valeur à l'autre.
 */
export function useVitesse(appId: number, telecharge: number | null): number | null {
  const precedent = useRef<{ appId: number; octets: number; t: number } | null>(null);
  const [vitesse, setVitesse] = useState<number | null>(null);

  useEffect(() => {
    if (telecharge == null) {
      precedent.current = null;
      setVitesse(null);
      return;
    }
    const maintenant = performance.now();
    const p = precedent.current;
    if (p && p.appId === appId && telecharge > p.octets) {
      const instantanee = ((telecharge - p.octets) * 1000) / (maintenant - p.t);
      setVitesse((v) => (v == null ? instantanee : v * 0.6 + instantanee * 0.4));
    } else if (!p || p.appId !== appId) {
      setVitesse(null);
    }
    if (!p || p.appId !== appId || telecharge !== p.octets) {
      precedent.current = { appId, octets: telecharge, t: maintenant };
    }
  }, [appId, telecharge]);

  return vitesse;
}

/** « 24 Mo/s ». */
export function debit(octetsParSeconde: number): string {
  const mo = octetsParSeconde / 1_000_000;
  return mo >= 10 ? `${Math.round(mo)} Mo/s` : `${mo.toFixed(1).replace(".", ",")} Mo/s`;
}

/** « environ 3 min », « environ 1 h 20 ». */
export function dureeRestante(secondes: number): string {
  if (!isFinite(secondes) || secondes <= 0) return "";
  if (secondes < 60) return "moins d’une minute";
  const min = Math.round(secondes / 60);
  if (min < 60) return `environ ${min} min`;
  const h = Math.floor(min / 60);
  const reste = min % 60;
  return `environ ${h} h${reste ? ` ${String(reste).padStart(2, "0")}` : ""}`;
}
