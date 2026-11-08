import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { NavRail } from "./NavRail";
import { PATHS } from "./paths";
import "./Layout.css";

/** Cadre commun à toutes les pages : barre de gauche + zone de contenu. */
export function Layout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Remonter en haut à chaque changement de page.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // Ctrl+K : recherche (libellé de la maquette 01).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        navigate(PATHS.recherche);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <div className="app">
      <NavRail />
      <main className="app__main">
        <div key={pathname} className="app__page">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
