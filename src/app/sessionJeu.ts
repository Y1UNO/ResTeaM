import { useEffect, useState } from "react";
import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { api, dansTauri } from "../api/commandes";
import type { EtatJeu } from "../api/types";

/**
 * Jeu en cours (lu par Rust dans le registre de Steam) : ResTeaM affiche « En cours »
 * avec un minuteur, puis la durée de la session quand le jeu se ferme.
 */
type Etat = EtatJeu & { pret: boolean; maj: (e: EtatJeu) => void };

export const useSessionJeu = create<Etat>((set) => ({
  enCours: null,
  derniere: null,
  pret: false,
  maj: (e) => set({ ...e, pret: true }),
}));

let installe = false;

/** Écoute les changements (événement de Rust), avec une relecture lente en filet de sécurité. */
export function installerSuiviJeu() {
  if (installe) return;
  installe = true;
  const lire = () =>
    api
      .jeuSession()
      .then((e) => useSessionJeu.getState().maj(e))
      .catch(() => {});
  void lire();
  window.setInterval(lire, 15_000);
  if (dansTauri) void listen<EtatJeu>("jeu-session", (e) => useSessionJeu.getState().maj(e.payload)).catch(() => {});
}

/** « 12:34 » puis « 1 h 05 » : temps écoulé depuis `debut` (millisecondes), mis à jour chaque seconde. */
export function useChrono(debut: number | null | undefined): string | null {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    if (debut == null) return;
    const t = window.setInterval(() => setMaintenant(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [debut]);
  if (debut == null) return null;
  return duree(Math.max(0, maintenant - debut));
}

export function duree(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")}`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
