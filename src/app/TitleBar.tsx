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

  const act = (fn: "minimize" | "toggleMaximize" | "close") => {
    if (inTauri) void getCurrentWindow()[fn]();
  };

  return (
    <div className={`titlebar${pleinEcran ? " titlebar--plein" : ""}`}>
      <div className="titlebar__drag" data-tauri-drag-region />
      <div className="titlebar__controls">
        {/* Boutons dessinés dans la DA : traits arrondis, petit mouvement au survol. */}
        <button type="button" className="titlebar__btn titlebar__btn--min" aria-label="Réduire" title="Réduire" onClick={() => act("minimize")}>
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <path d="M2 6.5h8" />
            <circle className="titlebar__point" cx="6" cy="9.4" r="0.8" fill="currentColor" stroke="none" />
          </svg>
        </button>
        <button
          type="button"
          className="titlebar__btn titlebar__btn--max"
          aria-label={maximized ? "Restaurer" : "Agrandir"}
          title={maximized ? "Restaurer" : "Agrandir"}
          onClick={() => act("toggleMaximize")}
        >
          {maximized ? (
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
              <rect x="1" y="3.5" width="7.5" height="7.5" rx="2" />
              <path className="titlebar__arriere" d="M3.5 3.5V3a2 2 0 0 1 2-2H9a2 2 0 0 1 2 2v3.5a2 2 0 0 1-2 2h-.5" />
            </svg>
          ) : (
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect className="titlebar__cadre" x="1.2" y="1.2" width="9.6" height="9.6" rx="2.4" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className="titlebar__btn titlebar__btn--close"
          aria-label="Fermer"
          title="Fermer"
          onClick={() => act("close")}
        >
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <path className="titlebar__croix" d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
