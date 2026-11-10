import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Logo } from "../components/Logo";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/commandes";
import { IconLogout, IconSettings } from "../components/icons";
import { useSession } from "./session";
import { PATHS } from "./paths";
import { basculerModeSalon, modeSalonActif } from "../lib/manette";
import { usePhaseLune } from "../lib/lune";
import "./LogoMenu.css";

type MenuState = "closed" | "open" | "closing";

/**
 * Logo en haut de la barre : un clic ouvre un petit menu en verre fumé
 * (Paramètres, Se déconnecter).
 * Ouverture et fermeture animées, jamais de fermeture instantanée.
 */
export function LogoMenu() {
  const lune = usePhaseLune();
  const [state, setState] = useState<MenuState>("closed");
  const rootRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const client = useQueryClient();
  const deconnecte = useSession((s) => s.deconnecte);

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

  const seDeconnecter = async () => {
    close();
    await api.deconnexion().catch(() => {});
    client.clear();
    deconnecte();
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
        title={`ResTeaM · ${lune.nom} ce soir (${Math.round(lune.eclairage * 100)} %)`}
        onClick={() => (isOpen ? close() : open())}
      >
        <Logo size={42} />
      </button>

      {state !== "closed" && (
        <div role="menu" aria-label="Menu ResTeaM" className={`logo-menu__panel is-${state}`}>
          <div className="logo-menu__lune">
            {lune.nom} ce soir · {Math.round(lune.eclairage * 100)} % éclairée
          </div>
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
          <button
            type="button"
            role="menuitem"
            className={`logo-menu__item${pathname === PATHS.journal ? " is-current" : ""}`}
            onClick={() => go(PATHS.journal)}
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
              <path d="M3.5 9.5h17M8 3v4M16 3v4" />
              <path d="M13.4 12.2a2.3 2.3 0 1 0 1.6 3.6 1.85 1.85 0 1 1-1.6-3.6z" fill="currentColor" stroke="none" />
            </svg>
            Journal de jeu
          </button>
          <button
            type="button"
            role="menuitem"
            className="logo-menu__item"
            onClick={() => {
              close();
              void basculerModeSalon();
            }}
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="12" rx="2.5" />
              <path d="M8 21h8M12 17v4" />
              <path d="M13.6 8.2a2.6 2.6 0 1 0 1.8 4 2.1 2.1 0 1 1-1.8-4z" fill="currentColor" stroke="none" />
            </svg>
            {modeSalonActif() ? "Quitter le mode Salon" : "Mode Salon"}
            <span className="logo-menu__raccourci">F11</span>
          </button>
          <div className="logo-menu__separateur" role="separator" />
          <button type="button" role="menuitem" className="logo-menu__item" onClick={seDeconnecter}>
            <IconLogout />
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}
