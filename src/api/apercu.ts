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
    default: {
      const donnee = donneesApercu(commande, args);
      if (donnee !== undefined) return donnee as T;
      throw erreur("interne", `Commande inconnue : ${commande}`);
    }
  }
}

// ——— Fausses données de l'étape 2b (noms des maquettes) ———

const maintenant = () => Math.floor(Date.now() / 1000);
const enveloppe = <T,>(donnees: T) => ({ donnees, horsLigne: false, recupereLe: maintenant() - 120 });
const JEUX = [
  { appId: 1145350, nom: "Hades II", minutes: 2880, deux: 708, favori: true },
  { appId: 391540, nom: "Undertale", minutes: 438, deux: 60, favori: true },
  { appId: 990080, nom: "Hogwarts Legacy", minutes: 1200, deux: 0, favori: false },
  { appId: 1903340, nom: "Clair Obscur: Expedition 33", minutes: 0, deux: 0, favori: true },
  { appId: 2868840, nom: "Slay the Spire 2", minutes: 95, deux: 95, favori: false },
  { appId: 730, nom: "Counter-Strike 2", minutes: 31500, deux: 0, favori: false },
];
const INSTALLES = [1145350, 391540, 1903340, 2868840];
/** Installations simulées : appId → heure du clic sur « Installer ». */
const INSTALLATIONS = new Map<number, number>();
const TAILLE_SIMULEE = 30_000_000_000;

function installationsSimulees() {
  return [...INSTALLATIONS].flatMap(([appId, debut]) => {
    const ecoule = Date.now() - debut;
    if (ecoule < 4000) return []; // Steam n'a pas encore commencé (fenêtre de choix du disque).
    const p = Math.min(1, (ecoule - 4000) / 40000);
    const j = JEUX.find((x) => x.appId === appId);
    return [
      {
        appId,
        nom: j?.nom ?? String(appId),
        dossier: "",
        bibliotheque: String.raw`E:\SteamLibrary`,
        taille: Math.round(TAILLE_SIMULEE * p),
        etat: p < 1 ? "telechargement" : "installe",
        aTelecharger: p < 1 ? TAILLE_SIMULEE : 0,
        telecharge: p < 1 ? Math.round(TAILLE_SIMULEE * p) : 0,
        derniereMaj: maintenant(),
        dernierLancement: 0,
      },
    ];
  });
}

function donneesApercu(commande: string, args?: Record<string, unknown>): unknown {
  switch (commande) {
    case "steam_local":
      return {
        trouve: true,
        chemin: String.raw`C:\Program Files (x86)\Steam`,
        bibliotheques: [
          { chemin: String.raw`C:\Program Files (x86)\Steam`, nombreJeux: 3 },
          { chemin: String.raw`E:\SteamLibrary`, nombreJeux: 7 },
        ],
      };
    case "jeux_installes":
      return [...INSTALLES.map((id, i) => {
        const j = JEUX.find((x) => x.appId === id)!;
        const dl = i === 3;
        return {
          appId: id,
          nom: j.nom,
          dossier: String.raw`E:\SteamLibrary\steamapps\common\ `.trim() + j.nom,
          bibliotheque: String.raw`E:\SteamLibrary`,
          taille: 3_000_000_000 * (i + 1),
          etat: dl ? "telechargement" : "installe",
          aTelecharger: dl ? 2_100_000_000 : 0,
          telecharge: dl ? 1_300_000_000 : 0,
          derniereMaj: maintenant() - 86400 * 3,
          dernierLancement: maintenant() - 86400,
        };
      }), ...installationsSimulees()];
    case "bibliotheque":
      return enveloppe({
        jeux: JEUX.map((j) => ({
          appId: j.appId,
          nom: j.nom,
          minutesTotal: j.minutes,
          minutesDeuxSemaines: j.deux,
          icone: "",
          dernierLancement: maintenant() - 86400 * 2,
          installation: INSTALLES.includes(j.appId)
            ? { etat: "installe", taille: 11_774_185_682, dossier: "", aTelecharger: 0, telecharge: 0 }
            : null,
          favori: j.favori,
          cache: false,
          collections: j.appId === 730 ? ["uc-coop"] : [],
        })),
        collections: [{ id: "uc-coop", nom: "Avec les potes", nombre: 5, dynamique: false }],
        nombreInstalles: INSTALLES.length,
        nombreFavoris: JEUX.filter((j) => j.favori).length,
        steamLocal: true,
      });
    case "recemment_joues":
      return enveloppe(
        JEUX.filter((j) => j.deux > 0).map((j) => ({
          appId: j.appId,
          nom: j.nom,
          minutesTotal: j.minutes,
          minutesDeuxSemaines: j.deux,
          icone: "",
          dernierLancement: maintenant() - 86400,
        })),
      );
    case "niveau_badges":
      return enveloppe({ niveau: 11, xp: 1130, xpNiveauActuel: 1100, xpPourSuivant: 70, badges: new Array(6).fill(0).map((_, i) => ({ id: i, appId: null, niveau: 1, xp: 100, obtenuLe: maintenant(), rarete: 1000 })) });
    case "amis":
      return enveloppe({
        prive: false,
        amis: [
          ["Meguru Bachira", 1, "Apex Legends"],
          ["Tututemobile", 1, "Hades II"],
          ["AtoxXy", 0, null],
          ["Furios-KL", 0, null],
        ].map(([pseudo, etat, jeu], i) => ({
          steamId: `7656119800000000${i}`,
          pseudo,
          avatar: "",
          urlProfil: "",
          etat,
          visibilite: 3,
          nomReel: null,
          pays: null,
          jeuEnCours: jeu,
          jeuEnCoursId: null,
          derniereDeconnexion: maintenant() - 3600 * (i * 20 + 5),
          lobby: i === 0 ? "1" : null,
          serveur: null,
          amiDepuis: 0,
        })),
      });
    case "succes_jeu": {
      if (args?.appId === 391540) return enveloppe(null);
      const succes = new Array(8).fill(0).map((_, i) => ({
        id: `S${i}`,
        nom: ["Premier sang", "Sans un bruit", "Collectionneur", "Lune noire", "Infatigable", "Tout vu", "Maître", "Éternel"][i],
        description: null,
        icone: null,
        iconeGrise: null,
        cache: false,
        debloque: i < 3,
        debloqueLe: i < 3 ? maintenant() - 86400 * (i + 1) : null,
      }));
      return enveloppe({ appId: args?.appId, total: 50, debloques: 18, succes });
    }
    case "actus_jeu":
      return enveloppe(
        ["Mise à jour majeure 1.2", "Notes de version 1.1.4", "Feuille de route de l’hiver"].map((titre, i) => ({
          id: String(i),
          titre,
          url: "",
          auteur: null,
          contenu: "",
          date: maintenant() - 86400 * (3 + i * 9),
          source: "Annonces de la communauté",
          officielle: true,
          patch: i < 2,
        })),
      );
    case "images_jeux":
      // Vide : le front utilise les adresses classiques du CDN Steam (vraies images).
      return {};
    case "steam_lien": {
      const a = args?.action as { type?: string; appId?: number } | undefined;
      if (a?.type === "installer" && a.appId) INSTALLATIONS.set(a.appId, Date.now());
      return null;
    }
    case "patch_notes":
      return enveloppe({
        id: "1",
        titre: "Mise à jour majeure",
        url: "https://store.steampowered.com/news/app/1145350",
        date: maintenant() - 3 * 86400,
        version: "1.2",
        patch: true,
        sections: [
          {
            categorie: "nouveau",
            elements: [
              { texte: "Ici s’affichent les ajouts du patch, récupérés depuis les actus Steam du jeu.", sous: [] },
              { texte: "Chaque ligne de l’annonce devient un point lisible, avec la mise en forme du thème.", sous: [] },
            ],
          },
          {
            categorie: "equilibrage",
            elements: [
              { texte: "Buffed Axebot:", sous: ["Hammer Uppercut damage increased from 12 → 14", "Gains +10 Max HP on respawn"] },
              { texte: "Les valeurs modifiées peuvent être mises en évidence.", sous: [] },
            ],
          },
          {
            categorie: "correctifs",
            elements: [
              { texte: "Liste des bugs corrigés.", sous: [] },
              { texte: "Améliorations de performances et de stabilité.", sous: [] },
            ],
          },
        ],
      });
    default:
      return undefined;
  }
}
