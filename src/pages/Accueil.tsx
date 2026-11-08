import { useEffect, useMemo, useState } from "react";
import { useBibliotheque, useImages } from "../api/requetes";
import { estErreurApp } from "../api/types";
import { HeroBackdrop } from "../components/HeroBackdrop";
import { imagesDe } from "../lib/images";
import { Hero } from "./accueil/Hero";
import { PanneauAmis } from "./accueil/PanneauAmis";
import { Ruban } from "./accueil/Ruban";
import "./pages.css";
import "./accueil/accueil.css";

const NB_RUBAN = 8;
const FOND_NEUTRE = "radial-gradient(ellipse at 65% 35%, rgba(70,72,84,.55), rgba(40,42,50,.2) 55%, #0E0E10 100%)";

/**
 * Accueil (maquette 01) : le jeu en vedette, le ruban « Reprendre » et les amis.
 * Le ruban montre les derniers jeux lancés ; cliquer une jaquette la met en vedette.
 */
export function Accueil() {
  const biblio = useBibliotheque();
  const b = biblio.data?.donnees;

  const jeux = useMemo(() => {
    const visibles = (b?.jeux ?? []).filter((j) => !j.cache);
    const lances = visibles.filter((j) => j.dernierLancement > 0).sort((x, y) => y.dernierLancement - x.dernierLancement);
    const base = lances.length > 0 ? lances : [...visibles].sort((x, y) => y.minutesTotal - x.minutesTotal);
    return base.slice(0, NB_RUBAN);
  }, [b]);

  const [choisi, setChoisi] = useState(0);
  useEffect(() => {
    if (choisi >= jeux.length) setChoisi(0);
  }, [jeux.length, choisi]);

  const images = useImages(jeux.map((j) => j.appId));
  const vedette = jeux[choisi];

  return (
    <div className="accueil">
      {vedette ? (
        <Hero jeu={vedette} images={imagesDe(vedette.appId, images.data)} />
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
