import { create } from "zustand";
import { api } from "../api/commandes";

/**
 * - `chargement` : on lit la session et l'état de la clé au démarrage ;
 * - `deconnecte` : écran Connexion ;
 * - `sans-cle` : connecté, mais aucune clé API (écran Clé API) ;
 * - `pret` : l'app complète.
 */
export type Statut = "chargement" | "deconnecte" | "sans-cle" | "pret";

type EtatSession = {
  statut: Statut;
  steamId: string | null;
  initialiser: () => Promise<void>;
  connecte: (steamId: string) => Promise<void>;
  cleEnregistree: () => void;
  cleSupprimee: () => void;
  deconnecte: () => void;
};

export const useSession = create<EtatSession>((set) => ({
  statut: "chargement",
  steamId: null,

  initialiser: async () => {
    try {
      const [session, cle] = await Promise.all([api.sessionLire(), api.cleEtat()]);
      if (!session) set({ statut: "deconnecte", steamId: null });
      else set({ statut: cle ? "pret" : "sans-cle", steamId: session.steamId });
    } catch {
      set({ statut: "deconnecte", steamId: null });
    }
  },

  connecte: async (steamId) => {
    const cle = await api.cleEtat().catch(() => false);
    set({ statut: cle ? "pret" : "sans-cle", steamId });
  },

  cleEnregistree: () => set({ statut: "pret" }),
  cleSupprimee: () => set({ statut: "sans-cle" }),
  deconnecte: () => set({ statut: "deconnecte", steamId: null }),
}));
