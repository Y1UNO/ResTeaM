import { useCallback, useMemo } from "react";
import { QueryClient, useInfiniteQuery, useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useSession } from "../app/session";
import { api } from "./commandes";
import { estErreurApp, type GenreWorkshop, type ImagesJeu, type TriWorkshop } from "./types";

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

/**
 * Jeux installés (lecture du disque). Relu toutes les 2 s si `suivre` (installation
 * qui vient d'être lancée) ou tant qu'un téléchargement apparaît sur le disque.
 */
export function useJeuxInstalles(suivre = false) {
  return useQuery({
    queryKey: ["installes"],
    queryFn: api.jeuxInstalles,
    staleTime: 5_000,
    refetchInterval: (q) =>
      suivre || q.state.data?.some((j) => j.etat === "telechargement" || j.etat === "enPause") ? 2_000 : false,
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

// ——— Étape 3 ———

/** Images de plusieurs jeux (une semaine de cache côté Rust). */
/** Taille des paquets d'images : le premier arrive vite, les suivants en parallèle. */
const PAQUET_IMAGES = 100;

export function useImages(appIds: number[]) {
  const cle = [...new Set(appIds)].sort((a, b) => a - b).join(",");
  const paquets = useMemo(() => {
    const ids = cle ? cle.split(",").map(Number) : [];
    const liste: number[][] = [];
    for (let i = 0; i < ids.length; i += PAQUET_IMAGES) liste.push(ids.slice(i, i + PAQUET_IMAGES));
    return liste;
  }, [cle]);
  const combiner = useCallback((resultats: UseQueryResult<Record<string, ImagesJeu>>[]) => {
    if (resultats.every((r) => !r.data)) return { data: undefined };
    const data: Record<string, ImagesJeu> = {};
    for (const r of resultats) Object.assign(data, r.data);
    return { data };
  }, []);
  return useQueries({
    queries: paquets.map((p) => ({
      queryKey: ["images", p.join(",")],
      queryFn: () => api.imagesJeux(p),
      staleTime: Infinity,
      // Steam limite parfois : on réessaie avec un délai qui grandit.
      retry: 5,
      retryDelay: (n: number) => Math.min(1000 * 2 ** n, 15_000),
    })),
    combine: combiner,
  });
}

export function usePatchNotes(appId: number | null) {
  return useQuery({
    queryKey: ["patch-notes", appId],
    queryFn: () => api.patchNotes(appId as number),
    enabled: appId != null,
    staleTime: 10 * 60_000,
  });
}

/** Données du PC (réseau, écriture disque, espace libre), toutes les 2 s si `actif`. */
export function useStatsSysteme(actif: boolean) {
  return useQuery({
    queryKey: ["stats-systeme"],
    queryFn: api.statsSysteme,
    enabled: actif,
    refetchInterval: actif ? 2_000 : false,
    staleTime: 0,
  });
}

/**
 * File des installations / désinstallations qui attendent un redémarrage de Steam.
 * Relue toutes les 2 s tant qu'elle n'est pas vide, sinon toutes les 15 s.
 */
export function useFileSteam() {
  return useQuery({
    queryKey: ["file-steam"],
    queryFn: api.fileSteam,
    staleTime: 0,
    refetchInterval: (q) => {
      const f = q.state.data;
      return f && (f.installations.length || f.desinstallations.length || f.reglages?.length) ? 2_000 : 15_000;
    },
  });
}

/** Nom d'un jeu du compte d'après la bibliothèque (pour « attend la fin de … »). */
export function useNomJeu(appId: number | null | undefined): string | null {
  const b = useBibliotheque();
  if (appId == null) return null;
  return b.data?.donnees.jeux.find((j) => j.appId === appId)?.nom ?? null;
}

// ——— Étape 5 : magasin ———

export function useFicheJeu(appId: number | null) {
  return useQuery({
    queryKey: ["fiche", appId],
    queryFn: () => api.ficheJeu(appId as number),
    enabled: appId != null,
    staleTime: 10 * 60_000,
  });
}

export function useAvisJeu(appId: number | null) {
  return useQuery({
    queryKey: ["avis", appId],
    queryFn: () => api.avisJeu(appId as number),
    enabled: appId != null,
    staleTime: 10 * 60_000,
  });
}

export function useVitrineMagasin() {
  return useQuery({ queryKey: ["vitrine"], queryFn: api.vitrineMagasin, staleTime: 10 * 60_000 });
}

export function useConfigPc() {
  return useQuery({ queryKey: ["config-pc"], queryFn: api.configPc, staleTime: Infinity });
}

// ——— Boutique complète ———

export function useProduits(appIds: number[]) {
  const cle = appIds.join(",");
  return useQuery({
    queryKey: ["produits", cle],
    queryFn: () => api.produitsMagasin(appIds),
    enabled: appIds.length > 0,
    staleTime: 30 * 60_000,
    placeholderData: (avant) => avant,
  });
}

export function useRechercheMagasin(terme: string) {
  const t = terme.trim();
  return useQuery({
    queryKey: ["recherche-magasin", t.toLowerCase()],
    queryFn: () => api.rechercheMagasin(t),
    enabled: t.length >= 2,
    staleTime: 10 * 60_000,
    placeholderData: (avant) => avant,
  });
}

export function useRayonMagasin(rayon: string | null) {
  return useQuery({
    queryKey: ["rayon", rayon],
    queryFn: () => api.rayonMagasin(rayon as string),
    enabled: rayon != null,
    staleTime: 30 * 60_000,
  });
}

export function useSouhaits() {
  const { pret, steamId } = usePret();
  return useQuery({ queryKey: ["souhaits", steamId], queryFn: api.listeSouhaits, enabled: pret, staleTime: 5 * 60_000 });
}

export function useClassements() {
  return useQuery({ queryKey: ["classements"], queryFn: api.classements, staleTime: 30 * 60_000 });
}

/** Joueurs en jeu (top 10), relu toutes les 3 min tant que la page est ouverte. */
export function useEnLigne() {
  return useQuery({ queryKey: ["en-ligne"], queryFn: api.enLigne, staleTime: 60_000, refetchInterval: 3 * 60_000 });
}

/** Amis qui possèdent un jeu (bibliothèques des amis en cache 24 h côté Rust). */
export function useAmisPossedant(appId: number | null) {
  const { pret } = usePret();
  return useQuery({
    queryKey: ["amis-possedant", appId],
    queryFn: () => api.amisPossedant(appId as number),
    enabled: pret && appId != null,
    staleTime: 30 * 60_000,
  });
}

/** Profil d'un ami (null : pas de requête). */
export function useProfilJoueur(steamId: string | null) {
  const { pret } = usePret();
  return useQuery({
    queryKey: ["profil-joueur", steamId],
    queryFn: () => api.profilJoueur(steamId as string),
    enabled: pret && steamId != null,
    staleTime: 5 * 60_000,
  });
}

/** Propriétés d'un jeu (fichiers de Steam), relues à chaque ouverture. */
export function useProprietesJeu(appId: number | null) {
  return useQuery({
    queryKey: ["proprietes", appId],
    queryFn: () => api.proprietesJeu(appId as number),
    enabled: appId != null,
    staleTime: 0,
  });
}

/** Tous les DLC d'un jeu (magasin), avec images et prix. */
export function useDlcJeu(appId: number | null) {
  return useQuery({ queryKey: ["dlc", appId], queryFn: () => api.dlcJeu(appId as number), enabled: appId != null, staleTime: 30 * 60_000 });
}

/** Objets de profil Steam équipés (fond animé, cadre, avatar animé). */
export function useObjetsProfil(steamId: string | null | undefined) {
  return useQuery({
    queryKey: ["objets-profil", steamId],
    queryFn: () => api.objetsProfil(steamId as string),
    enabled: !!steamId,
    staleTime: 30 * 60_000,
  });
}

// ——— Communauté ———

export function useWorkshopInstalle() {
  return useQuery({ queryKey: ["workshop-installe"], queryFn: api.workshopInstalle, staleTime: 5 * 60_000 });
}

/** Mods installés d'un jeu, 40 par page (« Voir plus » charge la suivante). */
export function useModsJeu(appId: number | null) {
  return useInfiniteQuery({
    queryKey: ["mods-jeu", appId],
    queryFn: ({ pageParam }) => api.modsJeu(appId as number, pageParam),
    initialPageParam: 0,
    getNextPageParam: (derniere, pages) => (pages.length * 40 < derniere.total ? pages.length : undefined),
    enabled: appId != null,
    staleTime: 10 * 60_000,
  });
}

export function useVitrineWorkshop(appId: number | null, tri: TriWorkshop, genre: GenreWorkshop, recherche: string) {
  return useInfiniteQuery({
    queryKey: ["vitrine-workshop", appId, tri, genre, recherche],
    queryFn: ({ pageParam }) => api.vitrineWorkshop(appId as number, tri, genre, recherche, pageParam),
    initialPageParam: 1,
    getNextPageParam: (derniere, pages) => (pages.length * 30 < derniere.donnees.total && derniere.donnees.objets.length > 0 ? pages.length + 1 : undefined),
    enabled: appId != null,
    staleTime: 30 * 60_000,
    retry: 1,
  });
}

export function useMesCaptures() {
  return useQuery({ queryKey: ["mes-captures"], queryFn: api.mesCaptures, staleTime: 60_000 });
}

export function useFilAmis() {
  return useQuery({ queryKey: ["fil-amis"], queryFn: api.filAmis, staleTime: 2 * 60_000, refetchInterval: 3 * 60_000 });
}
