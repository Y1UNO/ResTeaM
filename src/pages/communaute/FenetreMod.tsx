import { useEffect, useMemo, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { api } from "../../api/commandes";
import { useFicheMod, useWorkshopInstalle } from "../../api/requetes";
import { estErreurApp, type ObjetWorkshop } from "../../api/types";
import { date, entier, taille } from "../../lib/format";
import { degradeJaquette } from "../../lib/images";
import { viaCache } from "../../lib/imageLocale";

// ——— Installations en cours (abonnement fait, Steam télécharge) ———

type EnCours = { appId: number; total: number; recu: number };
type EtatInstalls = {
  enCours: Record<string, EnCours>;
  ajouter: (id: string, appId: number, total: number) => void;
  maj: (id: string, recu: number) => void;
  retirer: (id: string) => void;
};

export const useInstallsWorkshop = create<EtatInstalls>((set) => ({
  enCours: {},
  ajouter: (id, appId, total) => set((s) => ({ enCours: { ...s.enCours, [id]: { appId, total, recu: 0 } } })),
  maj: (id, recu) => set((s) => (s.enCours[id] ? { enCours: { ...s.enCours, [id]: { ...s.enCours[id], recu } } } : s)),
  retirer: (id) =>
    set((s) => {
      const { [id]: _, ...reste } = s.enCours;
      return { enCours: reste };
    }),
}));

/** Ensemble des mods installés (tous jeux), pour marquer « Installé ». */
export function useIdsInstalles() {
  const w = useWorkshopInstalle();
  return useMemo(() => new Set((w.data ?? []).flatMap((j) => j.ids)), [w.data]);
}

/**
 * Suit les téléchargements lancés depuis ResTeaM : toutes les 1,5 s, lit où en est
 * Steam (dossier du Workshop). Une fois installé, rafraîchit les listes.
 */
export function SuiviWorkshop() {
  const enCours = useInstallsWorkshop((s) => s.enCours);
  const maj = useInstallsWorkshop((s) => s.maj);
  const retirer = useInstallsWorkshop((s) => s.retirer);
  const client = useQueryClient();
  const ids = Object.keys(enCours);
  const etats = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["etat-mod", id],
      queryFn: () => api.etatMod(enCours[id].appId, id),
      refetchInterval: 1500,
      staleTime: 0,
    })),
  });
  useEffect(() => {
    etats.forEach((e, i) => {
      const id = ids[i];
      if (!e.data || !id) return;
      if (e.data.installe) {
        retirer(id);
        void client.invalidateQueries({ queryKey: ["workshop-installe"] });
        void client.invalidateQueries({ queryKey: ["mods-jeu", enCours[id]?.appId] });
        void client.invalidateQueries({ queryKey: ["fiche-mod"] });
      } else if (e.data.recu !== enCours[id]?.recu) {
        maj(id, e.data.recu);
      }
    });
  }); // à chaque rendu : les réponses changent toutes les 1,5 s
  return null;
}

/** Fraction téléchargée (0 à 1), ou `null` si rien n'est en cours pour cet objet. */
export function useProgression(id: string): number | null {
  const e = useInstallsWorkshop((s) => s.enCours[id]);
  if (!e) return null;
  return e.total > 0 ? Math.min(0.99, e.recu / e.total) : 0;
}

// ——— Fenêtre d'un objet ———

type Media = { type: "video" | "image"; src: string; youtube?: string };

/**
 * Fiche d'un objet du Workshop : grande image (ou la vidéo du fond en pleine
 * qualité s'il est installé), galerie HD, vidéos, avis, et Installer / Retirer
 * directement depuis ResTeaM.
 */
export function FenetreObjet({ objet: depart, appId, fermer }: { objet: ObjetWorkshop; appId: number; fermer: () => void }) {
  const fiche = useFicheMod(appId, depart.id);
  const objet = fiche.data?.objet ?? depart;
  const local = fiche.data?.local ?? null;
  const installes = useIdsInstalles();
  const installe = installes.has(depart.id);
  const progression = useProgression(depart.id);
  const ajouter = useInstallsWorkshop((s) => s.ajouter);
  const retirerSuivi = useInstallsWorkshop((s) => s.retirer);
  const client = useQueryClient();
  const [action, setAction] = useState<"installer" | "retirer" | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const medias: Media[] = useMemo(() => {
    const l: Media[] = [];
    if (local?.video) l.push({ type: "video", src: local.video });
    // Images en grande taille de l'auteur ; sinon l'aperçu de Steam (souvent un GIF
    // animé), et l'image du disque seulement s'il n'y a rien d'autre.
    const galerie = objet.galerie ?? [];
    for (const g of galerie) l.push({ type: "image", src: viaCache(g) });
    if (!galerie.length && objet.apercu) l.push({ type: "image", src: viaCache(objet.apercu) });
    if (!galerie.length && !objet.apercu && local?.image) l.push({ type: "image", src: local.image });
    for (const y of [...(objet.video ? [objet.video] : []), ...(objet.youtube ?? [])])
      if (!l.some((m) => m.youtube === y)) l.push({ type: "image", src: viaCache(`https://img.youtube.com/vi/${y}/hqdefault.jpg`), youtube: y });
    return l;
  }, [objet, local]);
  const [choix, setChoix] = useState(0);
  useEffect(() => setChoix(0), [medias.length]);
  const media = medias[Math.min(choix, medias.length - 1)];

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
      if (e.key === "ArrowRight") setChoix((c) => (c + 1) % Math.max(1, medias.length));
      if (e.key === "ArrowLeft") setChoix((c) => (c - 1 + medias.length) % Math.max(1, medias.length));
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [fermer, medias.length]);

  const lancer = (abonner: boolean) => {
    setAction(abonner ? "installer" : "retirer");
    setErreur(null);
    api
      .abonnerMod(appId, depart.id, abonner)
      .then(() => {
        if (abonner) ajouter(depart.id, appId, objet.taille);
        else {
          retirerSuivi(depart.id);
          void client.invalidateQueries({ queryKey: ["workshop-installe"] });
          void client.invalidateQueries({ queryKey: ["mods-jeu", appId] });
        }
        setConfirmer(false);
      })
      .catch((e) => setErreur(estErreurApp(e) ? e.message : String(e)))
      .finally(() => setAction(null));
  };

  return (
    <>
      <div className="com-voile" onClick={fermer} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label={objet.titre} className="com-fenetre">
        <div className="com-fenetre__scene">
          <div className="com-fenetre__media" style={media ? undefined : { background: degradeJaquette(objet.titre) }}>
            {media?.type === "video" && <video key={media.src} src={media.src} autoPlay loop muted playsInline />}
            {media?.type === "image" && <img key={media.src} src={media.src} alt="" draggable={false} />}
            {media?.youtube && (
              <button type="button" className="com-fenetre__lecture" aria-label="Regarder la vidéo sur YouTube" onClick={() => void api.ouvrirYoutube(media.youtube as string)}>
                ▶
              </button>
            )}
            {media?.type === "video" && <span className="com-fenetre__etiquette">Vidéo du fond · pleine qualité</span>}
          </div>
          <button type="button" className="com-fenetre__fermer" aria-label="Fermer" onClick={fermer}>
            ×
          </button>
        </div>

        {medias.length > 1 && (
          <div className="com-fenetre__vignettes" role="listbox" aria-label="Images et vidéos">
            {medias.map((m, i) => (
              <button key={`${m.src}-${i}`} type="button" role="option" aria-selected={i === choix} className={i === choix ? "is-actif" : undefined} onClick={() => setChoix(i)}>
                {m.type === "video" ? <video src={m.src} muted preload="metadata" /> : <img src={m.src} alt="" loading="lazy" draggable={false} />}
                {(m.type === "video" || m.youtube) && <span aria-hidden="true">▶</span>}
              </button>
            ))}
          </div>
        )}

        <div className="com-fenetre__texte">
          <div className="com-fenetre__haut">
            <div>
              <h2>{objet.titre || "Sans titre"}</h2>
              {objet.tags.length > 0 && (
                <div className="com-tags">
                  {objet.tags.slice(0, 8).map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="com-fenetre__actions">
              {progression != null ? (
                <div className="com-progression" aria-live="polite">
                  <span className="com-progression__texte">Téléchargement par Steam… {Math.round(progression * 100)} %</span>
                  <span className="com-progression__barre">
                    <span style={{ transform: `scaleX(${Math.max(0.03, progression)})` }} />
                  </span>
                  <button type="button" className="btn btn--lien" disabled={action != null} onClick={() => lancer(false)}>
                    Annuler
                  </button>
                </div>
              ) : installe ? (
                confirmer ? (
                  <div className="com-confirmer">
                    <span>Retirer ce mod ?</span>
                    <button type="button" className="btn btn--danger btn--petit" disabled={action != null} onClick={() => lancer(false)}>
                      {action === "retirer" ? "Retrait…" : "Oui, retirer"}
                    </button>
                    <button type="button" className="btn btn--lien" onClick={() => setConfirmer(false)}>
                      Non
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="com-installe">✓ Installé</span>
                    <button type="button" className="btn btn--secondaire btn--petit" onClick={() => setConfirmer(true)}>
                      Retirer
                    </button>
                  </>
                )
              ) : (
                <button type="button" className="btn btn--principal com-installer" disabled={action != null} onClick={() => lancer(true)}>
                  {action === "installer" ? "Demande à Steam…" : objet.taille > 0 ? `Installer · ${taille(objet.taille)}` : "Installer"}
                </button>
              )}
            </div>
          </div>
          {erreur && (
            <p className="message">
              {erreur}{" "}
              <button type="button" className="btn btn--lien" onClick={() => void api.ouvrirObjetWorkshop(objet.id, true)}>
                Ouvrir dans Steam
              </button>
            </p>
          )}
          {objet.description && <p className="com-fenetre__description">{objet.description}</p>}
          <dl className="com-chiffres">
            {objet.note != null && (
              <div>
                <dt>Avis positifs</dt>
                <dd>{Math.round(objet.note * 100)} %</dd>
              </div>
            )}
            {objet.abonnes > 0 && (
              <div>
                <dt>Abonnés</dt>
                <dd>{entier(objet.abonnes)}</dd>
              </div>
            )}
            {objet.favoris > 0 && (
              <div>
                <dt>Favoris</dt>
                <dd>{entier(objet.favoris)}</dd>
              </div>
            )}
            {objet.taille > 0 && (
              <div>
                <dt>Taille</dt>
                <dd>{taille(objet.taille)}</dd>
              </div>
            )}
            {objet.maj > 0 && (
              <div>
                <dt>Mis à jour</dt>
                <dd>{date(objet.maj)}</dd>
              </div>
            )}
          </dl>
          <div className="com-fenetre__liens">
            <button type="button" className="btn btn--lien" onClick={() => void api.ouvrirObjetWorkshop(objet.id, true)}>
              Page dans Steam
            </button>
            <button type="button" className="btn btn--lien" onClick={() => void api.ouvrirObjetWorkshop(objet.id, false)}>
              Ouvrir dans le navigateur
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
