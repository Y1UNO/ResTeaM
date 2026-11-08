import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Logo } from "../components/Logo";
import { IconSettings } from "../components/icons";
import { PATHS } from "./paths";
import "./LogoMenu.css";

type MenuState = "closed" | "open" | "closing";

/**
 * Logo en haut de la barre : un clic ouvre un petit menu en verre fumé
 * (Paramètres pour l'instant ; Se déconnecter arrivera à l'étape 2a).
 * Ouverture et fermeture animées, jamais de fermeture instantanée.
 */
export function LogoMenu() {
  const [state, setState] = useState<MenuState>("closed");
  const rootRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const open = () => {
    window.clearTimeout(timer.current);
    setState("open");
  };
  const close = () => {
    setState((s) => (s === "open" ? "closing" : s));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("closed"), 220);
  };

  // Fermer au clic à l'extérieur et avec Échap.
  useEffect(() => {
    if (state !== "open") return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [state]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const go = (to: string) => {
    close();
    if (pathname !== to) navigate(to);
  };

  const isOpen = state === "open";

  return (
    <div ref={rootRef} className="logo-menu">
      <button
        type="button"
        className={`rail__logo${isOpen ? " is-open" : ""}`}
        aria-label="Menu ResTeaM"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="ResTeaM"
        onClick={() => (isOpen ? close() : open())}
      >
        <Logo size={42} />
      </button>

      {state !== "closed" && (
        <div role="menu" aria-label="Menu ResTeaM" className={`logo-menu__panel is-${state}`}>
          <button
            type="button"
            role="menuitem"
            className={`logo-menu__item${pathname === PATHS.parametres ? " is-current" : ""}`}
            onClick={() => go(PATHS.parametres)}
            autoFocus
          >
            <IconSettings />
            Paramètres
          </button>
        </div>
      )}
    </div>
  );
}
