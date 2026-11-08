import { create } from "zustand";

/**
 * Installation suivie par l'app (une à la fois), visible sur toutes les pages :
 * - `choix` : fenêtre de choix du disque ;
 * - `lancement` : Steam redémarre en arrière-plan ;
 * - `suivi` : téléchargement en cours (ou prêt, selon le disque) ;
 * `reduite` : la fenêtre est repliée en pastille en bas à droite.
 */
export type PhaseInstallation = "choix" | "lancement" | "suivi";

export type JeuSuivi = { appId: number; nom: string; jaquette: string | null; hero: string | null };

type EtatInstallation = {
  jeu: JeuSuivi | null;
  phase: PhaseInstallation;
  reduite: boolean;
  /** Lecteur choisi (« E: »), pour l'espace libre. */
  lecteur: string | null;
  /** Taille estimée par le magasin, en attendant celle de Steam. */
  tailleEstimee: number | null;
  /** Dernière erreur d'installation, affichée dans la fenêtre de choix. */
  erreur: string | null;
  /** Le Rust a répondu avant la fin de l'animation de la fenêtre de choix. */
  demarreEnAvance: boolean;
  ouvrirChoix: (jeu: JeuSuivi, erreur?: string) => void;
  /** Ouvre directement le suivi (téléchargement déjà lancé, dans l'app ou dans Steam). */
  ouvrirSuivi: (jeu: JeuSuivi) => void;
  lance: (lecteur: string, tailleEstimee: number | null) => void;
  demarre: () => void;
  reduire: () => void;
  agrandir: () => void;
  fermer: () => void;
};

export const useInstallation = create<EtatInstallation>((set) => ({
  jeu: null,
  phase: "choix",
  reduite: false,
  lecteur: null,
  tailleEstimee: null,
  erreur: null,
  demarreEnAvance: false,
  ouvrirChoix: (jeu, erreur) =>
    set({
      jeu,
      phase: "choix",
      reduite: false,
      lecteur: null,
      tailleEstimee: null,
      erreur: erreur ?? null,
      demarreEnAvance: false,
    }),
  ouvrirSuivi: (jeu) => set((s) => ({ jeu, phase: "suivi", reduite: false, lecteur: s.jeu?.appId === jeu.appId ? s.lecteur : null })),
  // La fenêtre de choix se ferme en 450 ms ; le Rust peut répondre avant : on
  // retient la réponse pour ne pas rester bloqué sur « Steam démarre ».
  lance: (lecteur, tailleEstimee) =>
    set((s) => ({ phase: s.demarreEnAvance ? "suivi" : "lancement", demarreEnAvance: false, lecteur, tailleEstimee })),
  demarre: () => set((s) => (s.phase === "choix" ? { demarreEnAvance: true } : { phase: "suivi" })),
  reduire: () => set({ reduite: true }),
  agrandir: () => set({ reduite: false }),
  fermer: () => set({ jeu: null, reduite: false }),
}));
