import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, dansTauri } from "../api/commandes";
import type { ActionSalon, EtatSalon } from "../api/types";
import { BoutonsFenetre, type ActionFenetre } from "../app/TitleBar";
import { IconePanier } from "../components/Prix";
import "./salon.css";

const VERS_SALON: Record<ActionFenetre, ActionSalon> = { minimize: "reduire", toggleMaximize: "agrandir", close: "fermer" };

/** Chemin lisible d'une adresse (« /app/730/Counter-Strike_2/ »). */
function chemin(url: string): string {
  try {
    const u = new URL(url);
    return decodeURIComponent(u.pathname + (u.search.length > 1 ? u.search : "")).slice(0, 90);
  } catch {
    return "";
  }
}

/**
 * Barre du salon d'achat : la seule partie dessinée par ResTeaM. En dessous, ce sont
 * les vraies pages de Steam, dans leur propre espace isolé. L'adresse affichée vient
 * du moteur du navigateur (Rust), jamais de la page : une page ne peut pas la falsifier.
 */
export function SalonBarre() {
  const [etat, setEtat] = useState<EtatSalon | null>(null);

  useEffect(() => {
    api
      .salonEtat()
      .then((e) => e && setEtat(e))
      .catch(() => {});
    if (!dansTauri) return;
    let stop: (() => void) | undefined;
    listen<EtatSalon>("salon-etat", (e) => setEtat(e.payload))
      .then((u) => (stop = u))
      .catch(() => {});
    return () => stop?.();
  }, []);

  const act = (a: ActionSalon) => void api.salonAction(a).catch(() => {});
  const officiel = etat?.officiel ?? true;
  const securise = etat?.securise ?? true;

  return (
    <div className="salon-barre" data-tauri-drag-region>
      <div className="salon-barre__marque" data-tauri-drag-region>
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24">
          <path d="M14.5 3.2a8.6 8.6 0 1 0 6.3 12.6 7 7 0 1 1-6.3-12.6z" fill="#7ee2a8" />
        </svg>
        <span data-tauri-drag-region>
          <strong>Salon d’achat</strong>
          <em>Paiement géré par Steam</em>
        </span>
      </div>

      <div className="salon-barre__nav">
        <button type="button" aria-label="Page précédente" title="Précédente" onClick={() => act("retour")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <button type="button" aria-label="Page suivante" title="Suivante" onClick={() => act("avancer")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <button type="button" aria-label="Recharger" title="Recharger" className="salon-barre__recharger" onClick={() => act("recharger")}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5" />
          </svg>
        </button>
        <button type="button" aria-label="Accueil du magasin Steam" title="Accueil du magasin" onClick={() => act("accueil")}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 11l8-6.5 8 6.5M6.5 9.5V19h11V9.5" />
          </svg>
        </button>
      </div>

      {/* Adresse réelle, fournie par Rust : cadenas vert sur Steam, alerte ailleurs. */}
      <div
        className={`salon-barre__adresse${officiel ? " is-officiel" : " is-externe"}${securise ? "" : " is-danger"}${etat?.chargement ? " is-chargement" : ""}`}
        title={etat?.url ?? ""}
        data-tauri-drag-region
      >
        <span className="salon-barre__cadenas" aria-hidden="true">
          {officiel ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
              <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
              <path d="M12 8.5v4.5M12 16.2v.1" />
            </svg>
          )}
        </span>
        <span className="salon-barre__statut">{!securise ? "Non sécurisé" : officiel ? "Steam officiel" : "Hors de Steam"}</span>
        <strong className="salon-barre__hote">{etat?.hote || "store.steampowered.com"}</strong>
        <span className="salon-barre__chemin">{etat ? chemin(etat.url) : ""}</span>
        <span className="salon-barre__charge" aria-hidden="true" />
      </div>

      <div className="salon-barre__actions">
        <button type="button" className="salon-barre__panier" onClick={() => act("panier")}>
          <IconePanier />
          Panier
        </button>
        <button type="button" className="salon-barre__icone" aria-label="Ouvrir cette page dans le navigateur" title="Ouvrir dans le navigateur" onClick={() => act("navigateur")}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 4h6v6M20 4l-9 9M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
          </svg>
        </button>
      </div>

      <BoutonsFenetre act={(fn) => act(VERS_SALON[fn])} />
    </div>
  );
}
