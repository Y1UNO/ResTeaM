import { useEffect, useRef, useState } from "react";
import { api } from "../../api/commandes";
import { useStatsSysteme } from "../../api/requetes";
import type { Installation, StatsSysteme } from "../../api/types";
import { pourcentage, taille } from "../../lib/format";
import { debit, dureeRestante, useVitesse } from "../../lib/telechargement";

type Props = {
  appId: number;
  /** Installation lue sur le disque (null tant que Steam n'a rien créé). */
  installation: Installation | null;
  /** Vrai juste après « Installer », tant que Steam n'a pas commencé. */
  enAttente: boolean;
};

/** Au-delà, la mesure est fausse (compteur remis à zéro, carte réseau ajoutée…). */
const DEBIT_MAX = 5_000_000_000;

/** Débits réseau et écriture disque, déduits de deux lectures successives des compteurs du PC. */
function useDebitsPc(stats: StatsSysteme | undefined) {
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
function useEstimationReseau(appId: number, installation: Installation | null, stats: StatsSysteme | undefined) {
  const base = useRef<{ appId: number; reseau: number } | null>(null);
  const dernier = useRef<{ octets: number; t: number }>({ octets: -1, t: 0 });
  const enCours = installation?.etat === "telechargement" && installation.aTelecharger > 0;
  if (!enCours || !stats) {
    if (!enCours) base.current = null;
    return null;
  }
  if (!base.current || base.current.appId !== appId) {
    // Point de départ : ce qui a déjà été téléchargé selon Steam.
    base.current = { appId, reseau: stats.reseauRecu - installation.telecharge };
  }
  const maintenant = stats.horodatageMs;
  if (installation.telecharge !== dernier.current.octets) dernier.current = { octets: installation.telecharge, t: maintenant };
  const fige = installation.telecharge === 0 || maintenant - dernier.current.t > 15_000;
  if (!fige) return null;
  const estime = (stats.reseauRecu - base.current.reseau) / installation.aTelecharger;
  return Math.min(0.99, Math.max(0, estime));
}

/**
 * Suivi d'une installation : Steam télécharge en arrière-plan, l'app lit son
 * avancement sur le disque (appmanifest) et les compteurs du PC toutes les 2 s.
 */
export function SuiviInstallation({ appId, installation, enAttente }: Props) {
  const enCours = installation && (installation.etat === "telechargement" || installation.etat === "enPause");
  const actif = !!enCours || enAttente;
  const fraction =
    installation && installation.aTelecharger > 0 ? Math.min(1, installation.telecharge / installation.aTelecharger) : 0;
  const vitesse = useVitesse(appId, enCours && installation.etat === "telechargement" ? installation.telecharge : null);
  const stats = useStatsSysteme(actif);
  const pc = useDebitsPc(stats.data);
  const estimation = useEstimationReseau(appId, installation, stats.data);
  const fractionAffichee = estimation != null ? Math.max(fraction, estimation) : fraction;

  if (!actif) return null;

  const lecteur = installation?.dossier ? installation.dossier.slice(0, 2).toUpperCase() : null;
  const libre = lecteur ? stats.data?.disques.find((d) => d.lecteur.toUpperCase() === lecteur)?.libre : undefined;
  const titre = !enCours
    ? "Steam redémarre"
    : installation.etat === "enPause"
      ? "En pause"
      : installation.aTelecharger > 0
        ? "Téléchargement"
        : "Préparation";
  // Débit pour le temps restant : celui de Steam, sinon celui de la carte réseau.
  const debitUtile = vitesse && vitesse > 0 ? vitesse : estimation != null ? pc.reseau : null;
  const reste =
    enCours && debitUtile && debitUtile > 0
      ? (installation.aTelecharger * (1 - fractionAffichee)) / debitUtile
      : Infinity;

  return (
    <div className="carte-verre suivi" role="status" aria-live="polite">
      <div className="suivi__haut">
        <strong>{titre}</strong>
        {enCours && installation.aTelecharger > 0 && (
          <span className="suivi__pct" title={estimation != null ? "Estimation d'après la carte réseau" : undefined}>
            {estimation != null ? "≈ " : ""}
            {pourcentage(fractionAffichee)}
          </span>
        )}
      </div>
      <div className={`suivi__barre${enCours && installation.aTelecharger > 0 ? "" : " is-attente"}`}>
        <div style={enCours && installation.aTelecharger > 0 ? { width: `${fractionAffichee * 100}%` } : undefined} />
      </div>
      <div className="suivi__bas">
        <span>
          {!enCours
            ? "Le téléchargement démarre dans quelques secondes, sans fenêtre Steam."
            : installation.aTelecharger > 0
              ? [
                  `${estimation != null ? "≈ " : ""}${taille(fractionAffichee * installation.aTelecharger)} sur ${taille(installation.aTelecharger)}`,
                  installation.etat === "telechargement" ? dureeRestante(reste) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Steam prépare le téléchargement…"}
        </span>
        <button type="button" className="suivi__lien" onClick={() => void api.steamLien({ type: "telechargements" })}>
          Ouvrir dans Steam
        </button>
      </div>
      {/* Données du PC : carte réseau, écriture de Steam sur le disque, espace restant. */}
      <div className="suivi__pc">
        {pc.reseau != null && (
          <span>
            Réseau <strong>{debit(pc.reseau)}</strong>
          </span>
        )}
        {installation?.etat === "telechargement" && vitesse != null && (
          <span>
            Steam <strong>{debit(vitesse)}</strong>
          </span>
        )}
        {pc.ecriture != null && (
          <span>
            Écriture disque <strong>{debit(pc.ecriture)}</strong>
          </span>
        )}
        {lecteur && libre != null && (
          <span>
            {lecteur} <strong>{taille(libre)} libres</strong>
          </span>
        )}
      </div>
    </div>
  );
}
