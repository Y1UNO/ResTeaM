import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./TitleBar.css";

/** Vrai dans l'exe (WebView de Tauri), faux dans un simple navigateur. */
const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Barre de titre invisible, comme sur Steam : la fenêtre n'a plus de cadre Windows.
 * Une bande transparente en haut sert à déplacer la fenêtre (double-clic = agrandir),
 * et les trois boutons Réduire / Agrandir / Fermer sont dessinés dans la DA.
 */
export function TitleBar() {
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
    <div className="titlebar">
      <div className="titlebar__drag" data-tauri-drag-region />
      <div className="titlebar__controls">
        <button type="button" className="titlebar__btn" aria-label="Réduire" title="Réduire" onClick={() => act("minimize")}>
          <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10">
            <path d="M0 5.5h10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button
          type="button"
          className="titlebar__btn"
          aria-label={maximized ? "Restaurer" : "Agrandir"}
          title={maximized ? "Restaurer" : "Agrandir"}
          onClick={() => act("toggleMaximize")}
        >
          {maximized ? (
            <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="0.5" y="2.5" width="7" height="7" rx="1" />
              <path d="M2.5 2.5V1.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1" />
            </svg>
          ) : (
            <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="0.5" y="0.5" width="9" height="9" rx="1" />
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
          <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />
          </svg>
        </button>
      </div>
    </div>
  );
}
