import { QueryClient, useQuery } from "@tanstack/react-query";
import { useSession } from "../app/session";
import { api } from "./commandes";
import { estErreurApp } from "./types";

/** Erreurs qu'il ne sert à rien de réessayer. */
const DEFINITIVES = new Set(["cle_absente", "cle_refusee", "session_absente", "cle_format"]);

export const clientRequetes = new QueryClient({
  defaultOptions: {
    queries: {
      // Le cache principal est côté Rust ; ici on évite juste de redemander trop souvent.
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: (n, e) => !(estErreurApp(e) && DEFINITIVES.has(e.code)) && n < 2,
    },
  },
});

/** Profil de l'utilisateur connecté (avatar, pseudo, statut). */
export function useJoueurMoi() {
  const pret = useSession((s) => s.statut === "pret");
  const steamId = useSession((s) => s.steamId);
  return useQuery({
    queryKey: ["joueur", "moi", steamId],
    queryFn: api.joueurMoi,
    enabled: pret,
    staleTime: 5 * 60_000,
  });
}

// ——— Étape 2b ———

/** Requête qui n'a de sens qu'une fois connecté avec une clé. */
function usePret() {
  const pret = useSession((s) => s.statut === "pret");
  const steamId = useSession((s) => s.steamId);
  return { pret, steamId };
}

export function useSteamLocal() {
  return useQuery({ queryKey: ["steam-local"], queryFn: api.steamLocal, staleTime: 10 * 60_000 });
}

/** Jeux installés : relu toutes les 3 s si `suivre` (progression des téléchargements). */
export function useJeuxInstalles(suivre = false) {
  return useQuery({
    queryKey: ["installes"],
    queryFn: api.jeuxInstalles,
    staleTime: 5_000,
    refetchInterval: suivre ? 3_000 : false,
  });
}

export function useBibliotheque() {
  const { pret, steamId } = usePret();
  return useQuery({ queryKey: ["bibliotheque", steamId], queryFn: api.bibliotheque, enabled: pret });
}

export function useRecemmentJoues() {
  const { pret, steamId } = usePret();
  return useQuery({ queryKey: ["recents", steamId], queryFn: api.recemmentJoues, enabled: pret });
}

export function useNiveauBadges() {
  const { pret, steamId } = usePret();
  return useQuery({ queryKey: ["badges", steamId], queryFn: api.niveauBadges, enabled: pret });
}

export function useAmis() {
  const { pret, steamId } = usePret();
  return useQuery({ queryKey: ["amis", steamId], queryFn: api.amis, enabled: pret, refetchInterval: 60_000 });
}

export function useSuccesJeu(appId: number | null) {
  const { pret, steamId } = usePret();
  return useQuery({
    queryKey: ["succes", steamId, appId],
    queryFn: () => api.succesJeu(appId as number),
    enabled: pret && appId != null,
  });
}

export function useActusJeu(appId: number | null) {
  return useQuery({
    queryKey: ["actus", appId],
    queryFn: () => api.actusJeu(appId as number),
    enabled: appId != null,
    staleTime: 10 * 60_000,
  });
}
