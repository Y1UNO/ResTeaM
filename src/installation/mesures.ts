import { useEffect, useRef, useState } from "react";
import type { Installation, StatsSysteme } from "../api/types";

/** Au-delà, la mesure est fausse (compteur remis à zéro, carte réseau ajoutée…). */
const DEBIT_MAX = 5_000_000_000;

/** Débits réseau et écriture disque, déduits de deux lectures successives des compteurs du PC. */
export function useDebitsPc(stats: StatsSysteme | undefined) {
  const precedent = useRef<StatsSysteme | null>(null);
  const [debits, setDebits] = useState<{ reseau: number | null; ecriture: number | null }>({ reseau: null, ecriture: null });
  useEffect(() => {
    if (!stats) return;
    const p = precedent.current;
    if (p && stats.horodatageMs > p.horodatageMs) {
      const dt = (stats.horodatageMs - p.horodatageMs) / 1000;
      const plausible = (v: number) => (v >= 0 && v < DEBIT_MAX ? v : null);
      const reseau = plausible((stats.reseauRecu - p.reseauRecu) / dt);
      const ecriture =
        stats.steamEcrit != null && p.steamEcrit != null ? plausible((stats.steamEcrit - p.steamEcrit) / dt) : null;
      setDebits((d) => ({
        reseau: reseau == null ? null : d.reseau == null ? reseau : d.reseau * 0.5 + reseau * 0.5,
        ecriture: ecriture == null ? null : d.ecriture == null ? ecriture : d.ecriture * 0.5 + ecriture * 0.5,
      }));
    }
    precedent.current = stats;
  }, [stats]);
  return debits;
}

/**
 * Estimation de secours : si Steam ne réécrit pas l'avancement dans son appmanifest,
 * on le déduit des octets reçus par la carte réseau depuis le début du téléchargement.
 */
export function useEstimationReseau(appId: number, installation: Installation | null, stats: StatsSysteme | undefined) {
  const base = useRef<{ appId: number; reseau: number } | null>(null);
  const dernier = useRef<{ octets: number; t: number }>({ octets: -1, t: 0 });
  const enCours = installation?.etat === "telechargement" && installation.aTelecharger > 0;
  if (!enCours || !stats) {
    if (!enCours) base.current = null;
    return null;
  }
  if (!base.current || base.current.appId !== appId) {
    base.current = { appId, reseau: stats.reseauRecu - installation.telecharge };
  }
  const maintenant = stats.horodatageMs;
  if (installation.telecharge !== dernier.current.octets) dernier.current = { octets: installation.telecharge, t: maintenant };
  const fige = installation.telecharge === 0 || maintenant - dernier.current.t > 15_000;
  if (!fige) return null;
  const estime = (stats.reseauRecu - base.current.reseau) / installation.aTelecharger;
  return Math.min(0.99, Math.max(0, estime));
}
