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
