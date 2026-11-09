import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./TitleBar.css";

/** Vrai dans l'exe (WebView de Tauri), faux dans un simple navigateur. */
const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type TitleBarProps = {
  /** Écrans sans barre de gauche (Connexion, Clé API) : la bande commence au bord gauche. */
  pleinEcran?: boolean;
};

/**
 * Barre de titre invisible, comme sur Steam : la fenêtre n'a plus de cadre Windows.
 * Une bande transparente en haut sert à déplacer la fenêtre (double-clic = agrandir),
 * et les trois boutons Réduire / Agrandir / Fermer sont dessinés dans la DA.
 */
export function TitleBar({ pleinEcran = false }: TitleBarProps) {
  const act = (fn: ActionFenetre) => {
    if (inTauri) void getCurrentWindow()[fn]();
  };
  return (
    <div className={`titlebar${pleinEcran ? " titlebar--plein" : ""}`}>
      <div className="titlebar__drag" data-tauri-drag-region />
      <BoutonsFenetre act={act} />
    </div>
  );
}

export type ActionFenetre = "minimize" | "toggleMaximize" | "close";

/** Réduire / Agrandir / Fermer, dessinés dans la DA (aussi dans le salon d'achat). */
export function BoutonsFenetre({ act }: { act: (fn: ActionFenetre) => void }) {
  const [maximized, setMaximized] = useState(true);

  useEffect(() => {
    if (!inTauri) return;
    const win = getCurrentWindow();
    let stop: (() => void) | undefined;
    const refresh = () => win.isMaximized().then(setMaximized).catch(() => {});
    refresh();
    win
      .onResized(refresh)
      .then((unlisten) => (stop = unlisten))
      .catch(() => {});
    return () => stop?.();
  }, []);

  return (
      <div className="titlebar__controls">
        {/* Boutons dessinés dans la DA « clair de lune » (demande de Tom). */}
        {/* Réduire : un croissant qui se couche derrière l'horizon. */}
        <button type="button" className="titlebar__btn titlebar__btn--min" aria-label="Réduire" title="Réduire" onClick={() => act("minimize")}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <defs>
              <clipPath id="tb-horizon">
                <rect x="0" y="0" width="16" height="11" />
              </clipPath>
            </defs>
            <g clipPath="url(#tb-horizon)">
              <path className="titlebar__soleil" d="M7.4 4.2a3.3 3.3 0 1 0 3.6 4.9 2.7 2.7 0 1 1-3.6-4.9z" fill="currentColor" stroke="none" />
            </g>
            <path d="M2.5 11.5h11" />
          </svg>
        </button>
        {/* Agrandir / Restaurer : quatre coins de cadre et une étoile au centre. */}
        <button
          type="button"
          className="titlebar__btn titlebar__btn--max"
          aria-label={maximized ? "Restaurer" : "Agrandir"}
          title={maximized ? "Restaurer" : "Agrandir"}
          onClick={() => act("toggleMaximize")}
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            {maximized ? (
              <g className="titlebar__coins is-dedans">
                <path d="M6 2.5v2.2a1.3 1.3 0 0 1-1.3 1.3H2.5" />
                <path d="M10 2.5v2.2a1.3 1.3 0 0 0 1.3 1.3h2.2" />
                <path d="M6 13.5v-2.2A1.3 1.3 0 0 0 4.7 10H2.5" />
                <path d="M10 13.5v-2.2a1.3 1.3 0 0 1 1.3-1.3h2.2" />
              </g>
            ) : (
              <g className="titlebar__coins">
                <path d="M2.5 6V4a1.5 1.5 0 0 1 1.5-1.5h2" />
                <path d="M13.5 6V4A1.5 1.5 0 0 0 12 2.5h-2" />
                <path d="M2.5 10v2A1.5 1.5 0 0 0 4 13.5h2" />
                <path d="M13.5 10v2a1.5 1.5 0 0 1-1.5 1.5h-2" />
              </g>
            )}
            <path className="titlebar__etoile" d="M8 6.6l.45 1 1 .4-1 .45L8 9.4l-.45-.95-1-.45 1-.4z" fill="currentColor" stroke="none" />
          </svg>
        </button>
        {/* Fermer : une croix dans une orbite, qu'une petite lune parcourt au survol. */}
        <button type="button" className="titlebar__btn titlebar__btn--close" aria-label="Fermer" title="Fermer" onClick={() => act("close")}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <circle className="titlebar__orbite" cx="8" cy="8" r="6.2" strokeWidth="1" strokeDasharray="2.2 2.4" />
            <path className="titlebar__croix" d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" />
            <g className="titlebar__satellite">
              <circle cx="8" cy="1.8" r="1.1" fill="currentColor" stroke="none" />
            </g>
          </svg>
        </button>
      </div>
  );
}
