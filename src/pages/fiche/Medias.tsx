import { useEffect, useRef, useState } from "react";
import type { Media } from "../../api/types";

const NB_MINIATURES = 5;

/**
 * Grande image (bande-annonce ou capture) et 5 miniatures cliquables, avec un
 * fondu à chaque changement (maquette 02). Les bandes-annonces récentes de Steam
 * sont en HLS : lues par hls.js, chargé seulement quand il en faut un.
 */
export function Medias({ medias, nom }: { medias: Media[]; nom: string }) {
  const [choisi, setChoisi] = useState(0);
  const [cle, setCle] = useState(0);
  const liste = medias.slice(0, NB_MINIATURES);
  const m = liste[choisi] ?? liste[0];

  const choisir = (i: number) => {
    if (i === choisi) return;
    setChoisi(i);
    setCle((c) => c + 1);
  };

  if (!m) {
    return (
      <div className="fiche-medias">
        <div className="fiche-medias__grand fiche-medias__grand--vide">
          <span>Pas d’images pour ce jeu</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fiche-medias">
      <div key={cle} className="fiche-medias__grand">
        {m.video ? <Video media={m} /> : <img src={m.url} alt={`${nom} : capture d’écran`} draggable={false} />}
        <div className="fiche-medias__legende" aria-hidden="true">
          <span>{m.video ? "Bande-annonce" : "Capture d’écran"}</span>
          <span>
            {choisi + 1} / {liste.length}
          </span>
        </div>
      </div>
      {liste.length > 1 && (
        <div className="fiche-medias__miniatures">
          {liste.map((x, i) => (
            <button
              key={x.url}
              type="button"
              className={`fiche-medias__mini${i === choisi ? " is-actif" : ""}`}
              aria-label={x.video ? "Bande-annonce" : `Capture ${i}`}
              aria-pressed={i === choisi}
              onClick={() => choisir(i)}
              style={{ backgroundImage: `url("${x.miniature}")` }}
            >
              {x.video && (
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 4l13 8-13 8z" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Video({ media }: { media: Media }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [echec, setEchec] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const hls = media.url.includes(".m3u8");
    if (!hls || video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = media.url;
      return;
    }
    let detruire: (() => void) | undefined;
    let annule = false;
    void import("hls.js").then(({ default: Hls }) => {
      if (annule) return;
      if (!Hls.isSupported()) {
        setEchec(true);
        return;
      }
      // Pas de worker : la CSP de l'app n'autorise pas les scripts `blob:`.
      const h = new Hls({ enableWorker: false, capLevelToPlayerSize: true });
      h.on(Hls.Events.ERROR, (_e, d) => {
        if (d.fatal) setEchec(true);
      });
      h.loadSource(media.url);
      h.attachMedia(video);
      detruire = () => h.destroy();
    });
    return () => {
      annule = true;
      detruire?.();
    };
  }, [media.url]);

  if (echec) return <img src={media.miniature} alt="" draggable={false} />;
  return <video ref={ref} poster={media.miniature} controls autoPlay muted playsInline preload="metadata" />;
}
