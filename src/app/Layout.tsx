import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { NavRail } from "./NavRail";
import { TitleBar } from "./TitleBar";
import { CentreInstallation } from "../installation/CentreInstallation";
import { HorsLigne } from "./HorsLigne";
import { Lancement } from "./Lancement";
import { PATHS } from "./paths";
import { PastilleJeu } from "./PastilleJeu";
import { installerSuiviJeu } from "./sessionJeu";
import { listen } from "@tauri-apps/api/event";
import { dansTauri } from "../api/commandes";
import "./Layout.css";

/** Cadre commun à toutes les pages : barre de gauche + zone de contenu. */
export function Layout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Remonter en haut à chaque changement de page.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // Jeu en cours (pastille, bouton Jouer) et pages ouvertes depuis la zone de notification.
  useEffect(() => {
    installerSuiviJeu();
    if (!dansTauri) return;
    const pages: Record<string, string> = { bibliotheque: PATHS.bibliotheque, telechargements: PATHS.telechargements };
    let stop: (() => void) | undefined;
    listen<string>("aller-a", (e) => {
      const p = pages[e.payload];
      if (p) navigate(p);
    })
      .then((u) => (stop = u))
      .catch(() => {});
    return () => stop?.();
  }, [navigate]);

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
      <TitleBar />
      <NavRail />
      <CentreInstallation />
      <HorsLigne />
      <Lancement />
      <PastilleJeu />
      <main className="app__main">
        <div key={pathname} className="app__page">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
