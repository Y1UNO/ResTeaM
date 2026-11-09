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
import { installerDefilementFluide } from "./lib/defilement";

installerInteractions();
installerDefilementFluide();

// Lecture de la session et de l'état de la clé, une fois au démarrage.
void useSession.getState().initialiser();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={clientRequetes}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
