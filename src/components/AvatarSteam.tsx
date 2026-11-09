import { useState } from "react";
import { useObjetsProfil } from "../api/requetes";
import { useSession } from "../app/session";
import { viaCache } from "../lib/imageLocale";
import { usePersonnalisation } from "../pages/profil/Personnalisation";

/**
 * Avatar d'un joueur, animé quand il a équipé un avatar animé Steam (demande de Tom :
 * « la PP qui bouge » visible partout : barre de gauche, amis, recherche).
 * Pour soi : la personnalisation ResTeaM passe avant (image perso, animé ou non).
 */
export function AvatarSteam({ steamId, avatar, className }: { steamId: string | null | undefined; avatar: string | null | undefined; className?: string }) {
  const moi = useSession((s) => s.steamId);
  const perso = usePersonnalisation((s) => s.p);
  const objets = useObjetsProfil(steamId).data?.donnees;
  const [ratee, setRatee] = useState(false);
  const estMoi = !!steamId && steamId === moi;
  const anime = objets?.avatarAnime?.image && (!estMoi || perso.avatarAnime) ? objets.avatarAnime.image : null;
  const source = (estMoi && perso.avatarPerso) || anime || avatar;
  if (!source || ratee) return null;
  return <img className={className} src={source.startsWith("http://img.localhost") ? source : viaCache(source)} alt="" draggable={false} onError={() => setRatee(true)} />;
}
