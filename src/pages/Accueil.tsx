import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBibliotheque, useImages, useJeuxInstalles } from "../api/requetes";
import { estErreurApp, type JeuBibliotheque } from "../api/types";
import { HeroBackdrop } from "../components/HeroBackdrop";
import { usePalette } from "../lib/couleurs";
import { imagesDe } from "../lib/images";
import { Lueurs } from "./accueil/Ambiance";
import { Hero } from "./accueil/Hero";
import { PanneauAmis } from "./accueil/PanneauAmis";
import { Ruban } from "./accueil/Ruban";
import "./pages.css";
import "./accueil/accueil.css";

const NB_RUBAN = 8;
const FOND_NEUTRE = "radial-gradient(ellipse at 65% 35%, rgba(70,72,84,.55), rgba(40,42,50,.2) 55%, #0E0E10 100%)";
/** Après « Installer », on attend que Steam crée le jeu sur le disque pendant 15 min au plus. */
const ATTENTE_MAX = 15 * 60_000;

const enCours = (j: JeuBibliotheque) =>
  j.installation?.etat === "telechargement" || j.installation?.etat === "enPause";

/**
 * Accueil (maquette 01) : le jeu en vedette, le ruban « Reprendre » et les amis.
 * Les lueurs du fond prennent les couleurs de l'affiche du jeu en vedette.
 */
export function Accueil() {
  const client = useQueryClient();
  const biblio = useBibliotheque();
  const b = biblio.data?.donnees;

  // Installation lancée depuis l'app : appId + heure du clic.
  const [attente, setAttente] = useState<{ appId: number; depuis: number } | null>(null);

  const base = useMemo(() => {
    const visibles = (b?.jeux ?? []).filter((j) => !j.cache);
    const lances = visibles.filter((j) => j.dernierLancement > 0).sort((x, y) => y.dernierLancement - x.dernierLancement);
    const liste = lances.length > 0 ? lances : [...visibles].sort((x, y) => y.minutesTotal - x.minutesTotal);
    return liste.slice(0, NB_RUBAN);
  }, [b]);

  // Lecture du disque : toutes les 2 s tant qu'un téléchargement est en cours ou attendu.
  const telechargeAvant = base.some(enCours);
  const installes = useJeuxInstalles(telechargeAvant || attente != null);

  // État d'installation en direct (le disque fait foi, la bibliothèque peut dater d'une minute).
  const jeux = useMemo(() => {
    if (!installes.data) return base;
    const parId = new Map(installes.data.map((i) => [i.appId, i]));
    return base.map((j): JeuBibliotheque => {
      const i = parId.get(j.appId);
      return {
        ...j,
        installation: i
          ? { etat: i.etat, taille: i.taille, dossier: i.dossier, aTelecharger: i.aTelecharger, telecharge: i.telecharge }
          : null,
      };
    });
  }, [base, installes.data]);

  // Fin de l'attente : Steam a commencé (ou fini), ou délai dépassé.
  useEffect(() => {
    if (!attente) return;
    const jeu = installes.data?.find((i) => i.appId === attente.appId);
    if (jeu || Date.now() - attente.depuis > ATTENTE_MAX) setAttente(null);
  }, [installes.data, attente]);

  // Un téléchargement vient de se terminer : on rafraîchit la bibliothèque.
  const enCoursIds = jeux.filter(enCours).map((j) => j.appId).join(",");
  const [precedents, setPrecedents] = useState(enCoursIds);
  useEffect(() => {
    if (precedents && precedents !== enCoursIds) void client.invalidateQueries({ queryKey: ["bibliotheque"] });
    setPrecedents(enCoursIds);
  }, [enCoursIds, precedents, client]);

  const [choisi, setChoisi] = useState(0);
  useEffect(() => {
    if (choisi >= jeux.length) setChoisi(0);
  }, [jeux.length, choisi]);

  const images = useImages(jeux.map((j) => j.appId));
  const vedette = jeux[choisi];
  const imagesVedette = vedette ? imagesDe(vedette.appId, images.data) : null;
  const palette = usePalette(imagesVedette?.hero ?? null, vedette?.nom ?? "ResTeaM");

  return (
    <div className="accueil">
      {vedette && <Lueurs palette={palette} />}

      {vedette && imagesVedette ? (
        <Hero
          jeu={vedette}
          images={imagesVedette}
          enAttente={attente?.appId === vedette.appId}
          onInstaller={() => setAttente({ appId: vedette.appId, depuis: Date.now() })}
        />
      ) : (
        <section className="hero" aria-busy={biblio.isLoading}>
          <HeroBackdrop image={null} repli={FOND_NEUTRE} />
          <div className="hero__content">
            <div className="hero__text">
              <span className="kicker">
                <span className="kicker__dot" />
                {biblio.isLoading ? "Chargement de ta bibliothèque…" : "Accueil"}
              </span>
              <h1 className="hero__title">ResTeaM</h1>
              {biblio.isError && (
                <>
                  <p className="message">{estErreurApp(biblio.error) ? biblio.error.message : String(biblio.error)}</p>
                  <div className="hero__boutons">
                    <button type="button" className="btn btn--secondaire" onClick={() => void biblio.refetch()}>
                      Réessayer
                    </button>
                  </div>
                </>
              )}
              {b && b.jeux.length === 0 && <p className="placeholder-note">Ta bibliothèque Steam est vide.</p>}
            </div>
          </div>
        </section>
      )}

      {jeux.length > 0 && (
        <Ruban jeux={jeux} images={images.data} choisi={choisi} onChoisir={setChoisi} total={b?.jeux.length ?? 0} />
      )}

      <PanneauAmis />
    </div>
  );
}
