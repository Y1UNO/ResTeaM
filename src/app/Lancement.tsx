import { useEffect, useMemo, useRef, useState } from "react";
import { useBibliotheque, useImages, useVitrineMagasin } from "../api/requetes";
import { Logo } from "../components/Logo";
import { Lucioles } from "../components/Vivant";
import { imagesDe } from "../lib/images";
import "./Lancement.css";

/** Au plus ce temps à l'écran, même si des images traînent. */
const DUREE_MAX = 7000;
/** Au moins ce temps : le temps de voir l'animation. */
const DUREE_MIN = 1400;
/** Nombre de jeux dont on précharge les images (favoris d'abord, puis récents). */
const NB_JEUX = 36;

let dejaJoue = false;

/**
 * Écran de lancement (demande de Tom) : logo animé et progression pendant que les
 * images des favoris, des jeux récents et du magasin se téléchargent en arrière-plan
 * (elles vont dans le cache disque : la navigation est ensuite instantanée).
 * Une seule fois par lancement de l'app.
 */
export function Lancement() {
  const [visible, setVisible] = useState(!dejaJoue);
  const [sortie, setSortie] = useState(false);
  const biblio = useBibliotheque();
  const vitrine = useVitrineMagasin();
  const debut = useRef(performance.now());

  const ids = useMemo(() => {
    const jeux = (biblio.data?.donnees.jeux ?? []).filter((j) => !j.cache);
    const favoris = jeux.filter((j) => j.favori);
    const recents = [...jeux].sort((a, b) => b.dernierLancement - a.dernierLancement);
    const liste = [...favoris, ...recents].map((j) => j.appId);
    const offres = (vitrine.data?.donnees.offres ?? []).map((o) => o.appId);
    return [...new Set([...liste.slice(0, NB_JEUX), ...offres])];
  }, [biblio.data, vitrine.data]);
  const images = useImages(visible ? ids : []);

  const [total, setTotal] = useState(0);
  const [faites, setFaites] = useState(0);
  const lance = useRef(false);

  useEffect(() => {
    if (!visible || lance.current || !images.data || ids.length === 0) return;
    lance.current = true;
    const adresses = new Set<string>();
    ids.forEach((id, i) => {
      const im = imagesDe(id, images.data);
      if (im.jaquettePetite) adresses.add(im.jaquettePetite);
      if (im.jaquette && i < 12) adresses.add(im.jaquette);
      if (im.hero && i < 6) adresses.add(im.hero);
    });
    setTotal(adresses.size);
    for (const a of adresses) {
      const img = new Image();
      img.onload = img.onerror = () => setFaites((n) => n + 1);
      img.src = a;
    }
  }, [visible, images.data, ids]);

  const fini = total > 0 && faites >= total;
  const progression = total > 0 ? faites / total : biblio.data ? 0.15 : 0.05;

  useEffect(() => {
    if (!visible || sortie) return;
    const ecoule = performance.now() - debut.current;
    const fermer = () => {
      setSortie(true);
      window.setTimeout(() => {
        dejaJoue = true;
        setVisible(false);
      }, 700);
    };
    // Fini (ou rien à charger) : on attend la durée minimale ; sinon la durée maximale.
    const rien = biblio.isError || (biblio.data && ids.length === 0);
    const attente = fini || rien ? Math.max(0, DUREE_MIN - ecoule) : Math.max(0, DUREE_MAX - ecoule);
    const t = window.setTimeout(fermer, attente);
    return () => window.clearTimeout(t);
  }, [visible, sortie, fini, biblio.isError, biblio.data, ids.length]);

  if (!visible) return null;
  return (
    <div className={`lancement${sortie ? " is-sortie" : ""}`} role="status" aria-label="Chargement de ResTeaM">
      <Lucioles nombre={22} graine={3} />
      <div className="lancement__centre">
        <div className="lancement__logo">
          <span className="lancement__halo" aria-hidden="true" />
          <Logo size={132} tile={false} />
        </div>
        <span className="lancement__nom">
          {"ResTeaM".split("").map((c, i) => (
            <span key={i} style={{ animationDelay: `${0.35 + i * 0.06}s` }}>
              {c}
            </span>
          ))}
        </span>
        <div className="lancement__barre" aria-hidden="true">
          <span style={{ transform: `scaleX(${Math.max(0.04, progression)})` }} />
        </div>
        <span className="lancement__texte">
          {total > 0 ? `Images de tes jeux · ${faites} / ${total}` : biblio.data ? "Préparation des images…" : "Lecture de ta bibliothèque…"}
        </span>
      </div>
    </div>
  );
}
