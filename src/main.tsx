import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";

// Polices embarquées (aucun appel à Google Fonts).
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";

import "./styles/tokens.css";
import "./styles/animations.css";
import "./styles/base.css";
import "./styles/composants.css";
import "./styles/interactif.css";

import { router } from "./app/router";
import { clientRequetes } from "./api/requetes";
import { useSession } from "./app/session";
import { installerInteractions } from "./lib/interactif";
import { SalonBarre } from "./salon/SalonBarre";

/**
 * La même page sert aussi de barre au salon d'achat (webview « salon-barre ») :
 * elle n'affiche alors que la barre, sans l'app ni la session.
 * Dans l'aperçu navigateur : `?salon=barre`.
 */
type Interne = { __TAURI_INTERNALS__?: { metadata?: { currentWebview?: { label?: string } } } };
const etiquette = (window as unknown as Interne).__TAURI_INTERNALS__?.metadata?.currentWebview?.label;
const estBarreSalon = etiquette === "salon-barre" || new URLSearchParams(location.search).get("salon") === "barre";

if (estBarreSalon) document.documentElement.classList.add("est-salon");
else installerInteractions();

// Pas de menu « Enregistrer l'image sous… » du navigateur : ResTeaM a ses propres menus
// (clic droit sur un jeu). Les champs de texte gardent copier / coller.
document.addEventListener("contextmenu", (e) => {
  const cible = e.target as HTMLElement | null;
  if (!cible?.closest("input, textarea, [contenteditable='true']")) e.preventDefault();
});

// Lecture de la session et de l'état de la clé, une fois au démarrage.
if (!estBarreSalon) void useSession.getState().initialiser();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {estBarreSalon ? (
      <SalonBarre />
    ) : (
      <QueryClientProvider client={clientRequetes}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )}
  </React.StrictMode>,
);
