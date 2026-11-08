/**
 * Faux back-end utilisé seulement hors de l'exe (aperçu dans un navigateur, pour
 * vérifier les écrans). Jamais chargé dans l'exe de production.
 * `?apercu=connecte` dans l'adresse démarre directement connecté avec une clé.
 */
import type { ErreurApp } from "./types";

const connecte = typeof location !== "undefined" && location.search.includes("apercu=connecte");
const etat = {
  steamId: connecte ? "76561198000000000" : (null as string | null),
  cle: connecte,
  annuler: null as null | (() => void),
};

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));
const erreur = (code: ErreurApp["code"], message: string): ErreurApp => ({ code, message });

export async function apercu<T>(commande: string, args?: Record<string, unknown>): Promise<T> {
  await attendre(250);
  switch (commande) {
    case "session_lire":
      return (etat.steamId ? { steamId: etat.steamId } : null) as T;
    case "connexion_steam":
      return new Promise<T>((ok, ko) => {
        const t = setTimeout(() => {
          etat.steamId = "76561198000000000";
          ok({ steamId: etat.steamId } as T);
        }, 2500);
        etat.annuler = () => {
          clearTimeout(t);
          ko(erreur("annule", "Connexion annulée."));
        };
      });
    case "connexion_annuler":
      etat.annuler?.();
      return undefined as T;
    case "deconnexion":
      etat.steamId = null;
      return undefined as T;
    case "cle_etat":
      return etat.cle as T;
    case "cle_enregistrer": {
      const cle = String(args?.cle ?? "").replace(/\s/g, "");
      if (!/^[0-9a-fA-F]{32}$/.test(cle)) {
        throw erreur("cle_format", "La clé fait 32 caractères : des chiffres et des lettres de A à F.");
      }
      await attendre(800);
      if (/^0+$/.test(cle)) throw erreur("cle_refusee", "Steam refuse cette clé API. Vérifie-la sur steamcommunity.com/dev/apikey.");
      etat.cle = true;
      return undefined as T;
    }
    case "cle_supprimer":
      etat.cle = false;
      return undefined as T;
    case "ouvrir_page_cle_api":
      return undefined as T;
    case "joueur_moi":
      return {
        donnees: {
          steamId: etat.steamId,
          pseudo: "Aperçu",
          avatar: "",
          urlProfil: "",
          etat: 1,
          visibilite: 3,
          nomReel: null,
          pays: "FR",
          jeuEnCours: null,
          jeuEnCoursId: null,
        },
        horsLigne: false,
        recupereLe: Math.floor(Date.now() / 1000),
      } as T;
    default:
      throw erreur("interne", `Commande inconnue : ${commande}`);
  }
}
