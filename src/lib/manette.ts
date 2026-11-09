/**
 * Manette (API Gamepad de WebView2) et mode « Salon » (plein écran, interface agrandie).
 *
 * - Croix ou stick gauche : le focus va à l'élément le plus proche dans cette direction ;
 * - A : valider · B : fermer la fenêtre ouverte, sinon page précédente ;
 * - LB / RB : page précédente / suivante de la barre de gauche · Y : recherche ;
 * - stick droit : défiler · Menu (ou F11) : mode Salon.
 *
 * Le focus est bien visible tant que la manette sert (classe `manette` sur <html>),
 * et redevient discret dès que la souris bouge.
 */
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { dansTauri } from "../api/commandes";

const FOCUSABLES =
  'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Bouton → indice standard de l'API Gamepad. */
const B = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, vue: 8, menu: 9, haut: 12, bas: 13, gauche: 14, droite: 15 } as const;
type Direction = "haut" | "bas" | "gauche" | "droite";

const ZOOM_SALON = 1.25;
let salon = false;
const ecouteursSalon = new Set<(actif: boolean) => void>();

export function modeSalonActif() {
  return salon;
}
export function suivreModeSalon(f: (actif: boolean) => void) {
  ecouteursSalon.add(f);
  return () => void ecouteursSalon.delete(f);
}

/** Plein écran + interface agrandie (zoom de WebView2 : les mises en page en vh restent justes). */
export async function basculerModeSalon(actif = !salon) {
  salon = actif;
  document.documentElement.classList.toggle("mode-salon", actif);
  ecouteursSalon.forEach((f) => f(actif));
  try {
    if (dansTauri) {
      await getCurrentWindow().setFullscreen(actif);
      await getCurrentWebview().setZoom(actif ? ZOOM_SALON : 1);
    } else if (actif) {
      await document.documentElement.requestFullscreen?.();
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch {
    /* plein écran refusé : le mode reste visuel */
  }
}

function visible(el: HTMLElement): boolean {
  if (el.closest("[aria-hidden='true'], [inert]")) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const s = getComputedStyle(el);
  return s.visibility !== "hidden" && s.pointerEvents !== "none" && Number(s.opacity) > 0.05;
}

/** Zone active : la fenêtre modale ouverte (la plus récente), sinon toute la page. */
function zone(): ParentNode {
  const modales = document.querySelectorAll<HTMLElement>("[aria-modal='true'], [role='dialog'], [role='menu']");
  return modales.length ? modales[modales.length - 1] : document;
}

function candidats(): HTMLElement[] {
  // Boutons de la fenêtre (réduire, fermer) jamais visés : le mode Salon passe par Menu.
  return [...zone().querySelectorAll<HTMLElement>(FOCUSABLES)].filter((e) => !e.closest(".titlebar") && visible(e));
}

function centre(r: DOMRect) {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Élément le plus proche dans une direction : distance dans l'axe + écart sur le côté (pénalisé). */
export function plusProche(depart: DOMRect, liste: { r: DOMRect }[], dir: Direction): number {
  const c = centre(depart);
  let meilleur = -1;
  let score = Infinity;
  liste.forEach(({ r }, i) => {
    const d = centre(r);
    const dx = d.x - c.x;
    const dy = d.y - c.y;
    const [axe, cote] = dir === "haut" ? [-dy, dx] : dir === "bas" ? [dy, dx] : dir === "gauche" ? [-dx, dy] : [dx, dy];
    // Strictement dans la direction (au moins quelques pixels), sinon on reste sur place.
    if (axe < 4) return;
    const s = axe + Math.abs(cote) * 2.2;
    if (s < score) {
      score = s;
      meilleur = i;
    }
  });
  return meilleur;
}

function deplacer(dir: Direction) {
  const liste = candidats();
  if (!liste.length) return;
  const actif = document.activeElement as HTMLElement | null;
  const dedans = actif && actif !== document.body && liste.includes(actif);
  let cible: HTMLElement | undefined;
  if (!dedans) {
    // Premier pas : l'élément le plus haut à gauche du contenu (hors barre de gauche).
    const page = liste.filter((e) => e.closest(".app__main"));
    const contenu = page.length ? page : liste.filter((e) => !e.closest(".rail"));
    cible = (contenu.length ? contenu : liste).sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return ra.top - rb.top || ra.left - rb.left;
    })[0];
  } else {
    const autres = liste.filter((e) => e !== actif);
    const i = plusProche(actif.getBoundingClientRect(), autres.map((e) => ({ r: e.getBoundingClientRect() })), dir);
    cible = i >= 0 ? autres[i] : undefined;
  }
  if (!cible) return;
  cible.focus({ preventScroll: true });
  cible.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
}

function defilable(el: Element | null): Element | null {
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    const s = getComputedStyle(e);
    if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 4) return e;
  }
  return null;
}

function retour() {
  const modale = document.querySelector("[aria-modal='true'], [role='dialog'], [role='menu']");
  // Les fenêtres de ResTeaM se ferment avec Échap : on envoie la même touche.
  const echap = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
  (document.activeElement ?? document.body).dispatchEvent(echap);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  if (!modale) history.back();
}

let installe = false;

/** Branche la manette une seule fois. `pages` : chemins de la barre de gauche, dans l'ordre. */
export function installerManette(aller: (chemin: string) => void, pages: string[], recherche: string) {
  if (installe || typeof window === "undefined") return;
  installe = true;

  const html = document.documentElement;
  window.addEventListener("mousemove", () => html.classList.remove("manette"), { passive: true });
  window.addEventListener("keydown", (e) => {
    if (e.key === "F11") {
      e.preventDefault();
      void basculerModeSalon();
    }
  });

  const appuye = new Map<number, number>(); // bouton → instant de la prochaine répétition
  let boucle = 0;

  const repetition = (cle: number, presse: boolean, maintenant: number): boolean => {
    if (!presse) {
      appuye.delete(cle);
      return false;
    }
    const prochaine = appuye.get(cle);
    if (prochaine === undefined) {
      appuye.set(cle, maintenant + 380);
      return true;
    }
    if (maintenant >= prochaine) {
      appuye.set(cle, maintenant + 110);
      return true;
    }
    return false;
  };

  const page = (pas: number) => {
    const hash = location.hash.replace(/^#/, "").split("?")[0] || "/";
    const i = pages.findIndex((p) => (p === "/" ? hash === "/" : hash.startsWith(p)));
    aller(pages[(Math.max(0, i) + pas + pages.length) % pages.length]);
  };

  const tour = () => {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = [...pads].find((p) => p && p.connected);
    if (!pad) {
      boucle = 0;
      return;
    }
    const t = performance.now();
    const btn = (i: number) => !!pad.buttons[i]?.pressed;
    const [lx = 0, ly = 0, , ry = 0] = pad.axes;
    const seuil = 0.55;
    const dirs: [Direction, boolean, number][] = [
      ["haut", btn(B.haut) || ly < -seuil, 100],
      ["bas", btn(B.bas) || ly > seuil, 101],
      ["gauche", btn(B.gauche) || lx < -seuil, 102],
      ["droite", btn(B.droite) || lx > seuil, 103],
    ];
    let agi = false;
    for (const [d, presse, cle] of dirs) {
      if (repetition(cle, presse, t)) {
        deplacer(d);
        agi = true;
      }
    }
    const unCoup = (i: number) => {
      const presse = btn(i);
      const deja = appuye.has(i);
      if (presse && !deja) appuye.set(i, Infinity);
      if (!presse) appuye.delete(i);
      return presse && !deja;
    };
    if (unCoup(B.a)) {
      const el = document.activeElement as HTMLElement | null;
      if (el && el !== document.body) el.click();
      else deplacer("bas");
      agi = true;
    }
    if (unCoup(B.b)) {
      retour();
      agi = true;
    }
    if (unCoup(B.lb)) {
      page(-1);
      agi = true;
    }
    if (unCoup(B.rb)) {
      page(1);
      agi = true;
    }
    if (unCoup(B.y)) {
      aller(recherche);
      agi = true;
    }
    if (unCoup(B.menu)) {
      void basculerModeSalon();
      agi = true;
    }
    if (Math.abs(ry) > 0.2) {
      const cible = defilable(document.activeElement) ?? document.scrollingElement ?? document.documentElement;
      cible.scrollBy({ top: ry * 22 });
      agi = true;
    }
    if (agi) html.classList.add("manette");
    boucle = requestAnimationFrame(tour);
  };

  window.addEventListener("gamepadconnected", () => {
    html.classList.add("manette");
    window.dispatchEvent(new CustomEvent("manette", { detail: true }));
    if (!boucle) boucle = requestAnimationFrame(tour);
  });
  window.addEventListener("gamepaddisconnected", () => window.dispatchEvent(new CustomEvent("manette", { detail: false })));
  // Une manette déjà branchée au lancement n'envoie l'événement qu'à la première touche.
  if ([...(navigator.getGamepads?.() ?? [])].some((p) => p?.connected)) boucle = requestAnimationFrame(tour);
}
