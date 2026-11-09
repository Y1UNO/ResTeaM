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
  avancerFile();
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
const CDN_APERCU = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";
const SS = `${CDN_APERCU}/1145350`;

/**
 * File Steam simulée : `&enjeu=1` fait « tourner » Counter-Strike 2 pendant 25 s
 * après le chargement ; Steam « redémarre » ensuite pendant 3 s.
 */
const CHARGE = Date.now();
const EN_JEU = typeof location !== "undefined" && location.search.includes("enjeu=1");
type ReglageApercu = { appId: number; optionsLancement: string | null; majAuto: number | null; telechargementsEnJeu: number | null };
const FILE = { installations: [] as number[], desinstallations: [] as number[], reglages: [] as ReglageApercu[], redemarrage: 0, reglageSteam: null as Record<string, unknown> | null };
/** Partage du profil simulé. */
const PARTAGE = { actif: false };
/** Préférences de ResTeaM simulées. */
const PREFS = {
  fermerReduit: true,
  steamCache: true,
  reduireEnJeu: true,
  notifTelechargement: true,
  notifMaj: true,
  notifAmi: true,
  notifPromo: false,
};
const PREFS_DEMARRAGE = { actif: false };
/** Paramètres de Steam simulés (disque). */
const PARAMS_STEAM = { limiteKbps: 0, telechargementsEnJeu: true, ralentirStreaming: false, overlay: true, demarrageWindows: true };
const PROPRIETES = new Map<number, { optionsLancement: string; majAuto: number; telechargementsEnJeu: number }>();
const jeuEnCours = () => (EN_JEU && Date.now() - CHARGE < 25_000 ? 730 : null);
function avancerFile() {
  const vide = !FILE.installations.length && !FILE.desinstallations.length && !FILE.reglages.length && !FILE.reglageSteam;
  if (vide || jeuEnCours()) return;
  if (!FILE.redemarrage) {
    FILE.redemarrage = Date.now();
    return;
  }
  if (Date.now() - FILE.redemarrage < 3000) return;
  for (const id of FILE.installations) INSTALLATIONS.set(id, Date.now() - 4000);
  for (const id of FILE.desinstallations) {
    INSTALLATIONS.delete(id);
    const i = INSTALLES.indexOf(id);
    if (i >= 0) INSTALLES.splice(i, 1);
  }
  for (const r of FILE.reglages) {
    const p = PROPRIETES.get(r.appId) ?? { optionsLancement: "", majAuto: 0, telechargementsEnJeu: 0 };
    PROPRIETES.set(r.appId, {
      optionsLancement: r.optionsLancement ?? p.optionsLancement,
      majAuto: r.majAuto ?? p.majAuto,
      telechargementsEnJeu: r.telechargementsEnJeu ?? p.telechargementsEnJeu,
    });
  }
  if (FILE.reglageSteam) Object.assign(PARAMS_STEAM, FILE.reglageSteam);
  FILE.reglageSteam = null;
  FILE.installations = [];
  FILE.desinstallations = [];
  FILE.reglages = [];
  FILE.redemarrage = 0;
}
function fileSteam() {
  const vide = !FILE.installations.length && !FILE.desinstallations.length && !FILE.reglages.length && !FILE.reglageSteam;
  return {
    phase: vide ? "repos" : jeuEnCours() ? "attenteJeu" : "redemarrage",
    jeuEnCours: vide ? null : jeuEnCours(),
    installations: [...FILE.installations],
    desinstallations: [...FILE.desinstallations],
    reglages: FILE.reglages.map((r) => ({ ...r })),
    reglageSteam: FILE.reglageSteam ? { ...FILE.reglageSteam } : null,
  };
}
/** Installations simulées : appId → heure du clic sur « Installer ». */
const INSTALLATIONS = new Map<number, number>();
const TAILLE_SIMULEE = 30_000_000_000;
const COMPTEURS = { t: Date.now(), reseau: 5_000_000_000, ecrit: 1_000_000_000 };

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
        dossier: String.raw`E:\SteamLibrary\steamapps\common\ `.trim() + (j?.nom ?? appId),
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

/** Abonnements simulés dans l'aperçu (identifiant → début). */
const ABONNEMENTS_APERCU = new Map<string, number>();
const CAPTURES_FACTICES = [
  "ef0f63061d0a0a9a7e46f3b84f125d25330e8f19",
  "c88996aa0af82894a8e50ebb951a503ebce3ab24",
  "b88cb7b48a86f07a7288bf37141f6558279f9bfc",
  "c8d2b18451a2cc4d5b4fdd78ed84a5e64e051eac",
];
const TITRES_WORKSHOP = ["Clair de lune sur la ville", "Nébuleuse bleue", "Forêt de lucioles", "Pluie d'étoiles", "Aurore boréale", "Lac gelé", "Cité néon", "Vague de nuit"];

/** Objet du Workshop factice pour l'aperçu (images des captures de Hades II). */
function objetFactice(i: number, appId: number) {
  return {
    id: String(3_000_000_000 + i),
    appId,
    titre: `${TITRES_WORKSHOP[i % TITRES_WORKSHOP.length]}${i >= TITRES_WORKSHOP.length ? ` ${Math.floor(i / TITRES_WORKSHOP.length) + 1}` : ""}`,
    apercu: `${CDN_APERCU}/1145350/ss_${CAPTURES_FACTICES[i % CAPTURES_FACTICES.length]}.600x338.jpg?t=1779901265`,
    description: "Un fond d'écran animé, en 4K, avec une boucle douce et la musique d'ambiance. Compatible avec les écrans larges.",
    taille: 12_000_000 + ((i * 7_919_000) % 380_000_000),
    maj: maintenant() - i * 86_400 * 5,
    abonnes: 250_000 - i * 3_100,
    favoris: 12_000 - i * 150,
    vues: 900_000 - i * 9_000,
    note: 0.98 - (i % 9) * 0.04,
    votes: 18_000 - i * 200,
    tags: ["Anime", "Paysage", "4K", "Musique"].slice(0, 2 + (i % 3)),
    video: null,
  };
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
      return enveloppe({ niveau: 11, xp: 1130, xpNiveauActuel: 1100, xpPourSuivant: 70, badges: [
          { id: 1, appId: null, niveau: 7, xp: 350, obtenuLe: maintenant() - 86400 * 40, rarete: 0 },
          { id: 13, appId: null, niveau: 130, xp: 228, obtenuLe: maintenant() - 86400 * 9, rarete: 0 },
          { id: 1, appId: 1145350, niveau: 2, xp: 200, obtenuLe: maintenant() - 86400 * 20, rarete: 0 },
          { id: 1, appId: 391540, niveau: 1, xp: 100, obtenuLe: maintenant() - 86400 * 200, rarete: 0 },
          { id: 2, appId: null, niveau: 1, xp: 100, obtenuLe: maintenant() - 86400 * 300, rarete: 0 },
          { id: 17, appId: null, niveau: 3, xp: 75, obtenuLe: maintenant() - 86400 * 60, rarete: 0 },
        ] });
    case "amis":
      return enveloppe({
        prive: false,
        amis: [
          ["Meguru Bachira", 1, "Apex Legends"],
          ["Tututemobile", 1, "Hades II"],
          ["AtoxXy", 0, null],
          ["Furios-KL", 0, null],
        ].map(([pseudo, etat, jeu], i) => ({
          steamId: `7656119800000010${i}`,
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
    case "options_installation":
      return {
        nom: String(args?.nom ?? "Jeu"),
        tailleEstimee: 15_000_000_000,
        disques: [
          { bibliotheque: String.raw`C:\Program Files (x86)\Steam`, lecteur: "C:", nom: "", libre: 9_000_000_000, total: 499_000_000_000 },
          { bibliotheque: String.raw`E:\SteamLibrary`, lecteur: "E:", nom: "Data", libre: 593_000_000_000, total: 821_000_000_000 },
        ],
        jeuEnCours: jeuEnCours(),
        dejaInstalle: false,
      };
    case "installer_jeu": {
      const id = Number(args?.appId);
      FILE.desinstallations = FILE.desinstallations.filter((x) => x !== id);
      if (!FILE.installations.includes(id)) FILE.installations.push(id);
      return fileSteam();
    }
    case "desinstaller_jeu": {
      const id = Number(args?.appId);
      FILE.installations = FILE.installations.filter((x) => x !== id);
      if (!FILE.desinstallations.includes(id)) FILE.desinstallations.push(id);
      return fileSteam();
    }
    case "annuler_file_steam": {
      const id = Number(args?.appId);
      FILE.installations = FILE.installations.filter((x) => x !== id);
      FILE.desinstallations = FILE.desinstallations.filter((x) => x !== id);
      FILE.reglages = FILE.reglages.filter((x) => x.appId !== id);
      return fileSteam();
    }
    case "proprietes_jeu": {
      const id = Number(args?.appId);
      const p = PROPRIETES.get(id) ?? { optionsLancement: id === 1145350 ? "-windowed" : "", majAuto: 0, telechargementsEnJeu: 0 };
      const nom = JEUX.find((j) => j.appId === id)?.nom ?? String(id);
      return {
        appId: id,
        installe: INSTALLES.includes(id),
        ...p,
        langue: "french",
        dossier: "E:\\SteamLibrary\\steamapps\\common\\" + nom,
        taille: 11_774_185_682,
        version: "20481234",
        derniereMaj: maintenant() - 86400 * 2,
        dlc: id === 1145350 ? [2868840] : [],
        enAttente: FILE.reglages.find((r) => r.appId === id) ?? null,
      };
    }
    case "regler_jeu": {
      const d = args?.demande as ReglageApercu;
      const existant = FILE.reglages.find((r) => r.appId === d.appId);
      if (existant) {
        if (d.optionsLancement != null) existant.optionsLancement = d.optionsLancement;
        if (d.majAuto != null) existant.majAuto = d.majAuto;
        if (d.telechargementsEnJeu != null) existant.telechargementsEnJeu = d.telechargementsEnJeu;
      } else FILE.reglages.push({ ...d });
      return fileSteam();
    }
    case "ouvrir_dossier_jeu":
      return null;
    case "dlc_jeu":
      return donneesApercu("produits_magasin", { appIds: Number(args?.appId) === 1145350 ? [2868840, 413150, 367520] : [] });
    case "file_steam":
      return fileSteam();
    case "preferences_lire":
      return { preferences: { ...PREFS }, demarrageWindows: PREFS_DEMARRAGE.actif };
    case "preferences_ecrire":
      Object.assign(PREFS, args?.preferences as object);
      return undefined;
    case "resteam_au_demarrage":
      PREFS_DEMARRAGE.actif = Boolean(args?.actif);
      return PREFS_DEMARRAGE.actif;
    case "bilan_trophees": {
      // `?niveau=N` : points choisis pour voir la lune d'un niveau donné dans l'aperçu.
      const ami = args?.steamId != null;
      return {
        donnees: {
          total: ami ? 214 : 712,
          jeux: ami ? 21 : 57,
          complets: ami ? [1145350] : [1145350, 413150, 2868840],
          plusRare: { appId: 1145350, nom: "Fin de la nuit", icone: "", pourcentage: 0.7 },
          dernier: { appId: 1903340, nom: "Expédition réussie", icone: null, date: Math.floor(Date.now() / 1000) - 3 * 86400 },
        },
        horsLigne: false,
        majLe: Math.floor(Date.now() / 1000),
      };
    }
    case "partage_etat":
      return PARTAGE.actif ? { steamId: "76561198000000000", profil: null } : null;
    case "partage_connecter":
      PARTAGE.actif = true;
      return { steamId: "76561198000000000", profil: null };
    case "partage_publier":
    case "partage_fichier":
    case "partage_retirer_fichier":
      return { ok: true };
    case "partage_arreter":
      PARTAGE.actif = false;
      return undefined;
    case "profil_partage":
      // Un ami sur deux partage son profil ResTeaM (aurore, cadre de lunes, couleur dorée).
      return Number(String(args?.steamId).slice(-1)) % 2 === 0
        ? { steamId: String(args?.steamId), style: { fond: "aurore", cadre: "lune", effet: "etoiles", accent: "#ffd27a", avatarAnime: true, jeuFond: null }, avatar: null, banniere: null, maj: Date.now() }
        : null;
    case "notification_essai":
      return undefined;
    case "jeu_session": {
      // `?enjeu=1` : un jeu tourne pendant 25 s après le chargement, puis la session se termine.
      const enJeu = jeuEnCours();
      return {
        enCours: enJeu ? { appId: enJeu, debut: CHARGE, fin: null } : null,
        derniere: EN_JEU && !enJeu ? { appId: 730, debut: CHARGE, fin: CHARGE + 25_000 } : null,
      };
    }
    case "parametres_steam":
      avancerFile();
      return {
        parametres: {
          ...PARAMS_STEAM,
          bibliotheques: [
            { disque: { bibliotheque: String.raw`C:\Program Files (x86)\Steam`, lecteur: "C:", nom: "", libre: 9_000_000_000, total: 499_000_000_000 }, nombreJeux: 7 },
            { disque: { bibliotheque: String.raw`E:\SteamLibrary`, lecteur: "E:", nom: "Data", libre: 593_000_000_000, total: 821_000_000_000 }, nombreJeux: 23 },
          ],
        },
        enAttente: FILE.reglageSteam ? { ...FILE.reglageSteam } : null,
        file: fileSteam(),
      };
    case "regler_steam": {
      const d = args?.demande as Record<string, unknown>;
      const net = Object.fromEntries(Object.entries(d).filter(([, v]) => v != null));
      FILE.reglageSteam = { ...(FILE.reglageSteam ?? {}), ...net };
      return fileSteam();
    }
    case "annuler_reglage_steam":
      FILE.reglageSteam = null;
      return fileSteam();
    case "steam_au_demarrage":
      PARAMS_STEAM.demarrageWindows = Boolean(args?.actif);
      return PARAMS_STEAM.demarrageWindows;
    case "ouvrir_bibliotheque_steam":
      return undefined;
    case "stats_systeme": {
      // Compteurs cumulés, comme ceux de Windows.
      const t = Date.now();
      const actifs = installationsSimulees().filter((i) => i.etat === "telechargement").length;
      const dt = (t - COMPTEURS.t) / 1000;
      COMPTEURS.reseau += dt * (actifs ? 780_000_000 : 40_000);
      COMPTEURS.ecrit += dt * (actifs ? 750_000_000 : 0);
      COMPTEURS.t = t;
      return {
        horodatageMs: t,
        reseauRecu: Math.round(COMPTEURS.reseau),
        steamEcrit: Math.round(COMPTEURS.ecrit),
        disques: [
          { lecteur: "C:", libre: 9_000_000_000 },
          { lecteur: "E:", libre: 593_000_000_000 - installationsSimulees().reduce((s, i) => s + i.taille, 0) },
        ],
      };
    }
    case "fiche_jeu": {
      const id = Number(args?.appId);
      const j = JEUX.find((x) => x.appId === id);
      const ss = (h: string) => ({
        video: false,
        nom: "",
        miniature: `${SS}/ss_${h}.600x338.jpg?t=1779901265`,
        url: `${SS}/ss_${h}.1920x1080.jpg?t=1779901265`,
      });
      const hades = id === 1145350;
      return enveloppe({
        appId: id,
        nom: j?.nom ?? "Retro Rewind",
        gratuit: id === 730,
        resume:
          "Frayez-vous un chemin vers et au-delà des Enfers et affrontez le Titan du Temps dans ce deuxième volet ensorcelant du dungeon crawler de type rogue-like.",
        aPropos: [
          "Hades II est la suite du rogue-like de Supergiant Games, avec de nouveaux pouvoirs, de nouvelles armes et un monde mythologique encore plus vaste.",
          "Maîtrisez la magie de la sorcellerie, retrouvez des dieux de l'Olympe et affrontez le Titan du Temps.",
        ],
        genres: ["Action", "Indépendant", "RPG"],
        developpeurs: ["Supergiant Games"],
        editeurs: ["Supergiant Games"],
        sortie: "25 sept. 2025",
        aVenir: false,
        langues: ["Anglais", "Français", "Italien", "Allemand", "Espagnol - Espagne", "Japonais"],
        prix: id === 730 ? null : { initial: 2899, final_: 1957, reduction: 32, texteInitial: "28,99 €", texteFinal: "19,57 €" },
        demo: !hades,
        medias: hades
          ? [
              {
                video: true,
                nom: "Hades II · bande-annonce",
                miniature:
                  "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/257204779/2f6767807df172946f5d638093dcc1c933eb24bb/movie_600x337.jpg?t=1758942439",
                url: "https://video.akamai.steamstatic.com/store_trailers/1145350/1067641820/dfba9c6a8b09f5bd9b323d6e699ac685065b93d3/1758924611/hls_264_master.m3u8?t=1758942439",
              },
              ss("ef0f63061d0a0a9a7e46f3b84f125d25330e8f19"),
              ss("c88996aa0af82894a8e50ebb951a503ebce3ab24"),
              ss("b88cb7b48a86f07a7288bf37141f6558279f9bfc"),
              ss("c8d2b18451a2cc4d5b4fdd78ed84a5e64e051eac"),
            ]
          : [
              {
                video: false,
                nom: "",
                miniature: `${CDN_APERCU}/${id}/header.jpg`,
                url: `${CDN_APERCU}/${id}/library_hero.jpg`,
              },
            ],
        configMinimale: [
          { cle: "", valeur: "Système d'exploitation et processeur 64 bits nécessaires" },
          { cle: "Système d'exploitation", valeur: "Windows 10 64-bit" },
          { cle: "Processeur", valeur: "Dual Core 2.4 GHz" },
          { cle: "Mémoire vive", valeur: "8 GB de mémoire" },
          { cle: "Graphiques", valeur: "GeForce GTX 950, Radeon R7 360, or Intel HD Graphics 630" },
          { cle: "Espace disque", valeur: "11 GB d'espace disque disponible" },
        ],
        configRecommandee: [
          { cle: "Système d'exploitation", valeur: "Windows 10 64-bit" },
          { cle: "Processeur", valeur: "Quad Core 3.0 GHz" },
          { cle: "Mémoire vive", valeur: "16 GB de mémoire" },
          { cle: "Graphiques", valeur: "GeForce GTX 1060 6GB, Radeon RX 590" },
          { cle: "Espace disque", valeur: "11 GB d'espace disque disponible" },
        ],
        metacritic: hades ? 94 : null,
      });
    }
    case "avis_jeu":
      return enveloppe({
        global: { libelle: "Extrêmement positives", pourcentage: 95, nombre: 115_690 },
        francais: { libelle: "Extrêmement positives", pourcentage: 98, nombre: 4628 },
      });
    case "vitrine_magasin": {
      const o = (appId: number, nom: string, reduction: number, initial: number) => ({
        appId,
        nom,
        reduction,
        prixInitial: initial,
        prixFinal: Math.round((initial * (100 - reduction)) / 100),
        devise: "EUR",
        image: `${CDN_APERCU}/${appId}/capsule_616x353.jpg`,
        finOffre: maintenant() + 86400 * 2,
      });
      return enveloppe({
        offres: [
          o(1145350, "Hades II", 20, 2899),
          o(990080, "Hogwarts Legacy", 75, 5999),
          o(1903340, "Clair Obscur: Expedition 33", 25, 4999),
          o(413150, "Stardew Valley", 50, 1399),
          o(1091500, "Cyberpunk 2077", 65, 5999),
          o(1245620, "ELDEN RING", 40, 5999),
          o(367520, "Hollow Knight", 50, 1499),
          o(2379780, "Balatro", 25, 1499),
        ],
        meilleuresVentes: [o(730, "Counter-Strike 2", 0, 0), o(2868840, "Slay the Spire 2", 0, 2499)],
        nouveautes: [o(2868840, "Slay the Spire 2", 10, 2499), o(2379780, "Balatro", 0, 1499)],
        aVenir: [o(1903340, "Clair Obscur: Expedition 33", 0, 4999)],
      });
    }
    case "config_pc":
      return {
        systeme: "Windows 11 Home",
        memoire: 34_221_314_048,
        processeur: "AMD Ryzen 5 5600G with Radeon Graphics",
        coeurs: 12,
        carteGraphique: "NVIDIA GeForce RTX 5070",
        memoireGraphique: 12_820_938_752,
        espaceLibreMax: 582_099_709_952,
      };
    case "produits_magasin":
    case "recherche_magasin":
    case "rayon_magasin": {
      const catalogue: [number, string, number, number, string[]][] = [
        [1145350, "Hades II", 2899, 20, ["Action", "Roguelike", "Indépendant"]],
        [990080, "Hogwarts Legacy", 5999, 75, ["Monde ouvert", "RPG", "Aventure"]],
        [1903340, "Clair Obscur: Expedition 33", 4999, 25, ["RPG", "Tour par tour"]],
        [413150, "Stardew Valley", 1399, 0, ["Simulation", "Agriculture", "Détente"]],
        [1091500, "Cyberpunk 2077", 5999, 65, ["RPG", "Monde ouvert", "Science-fiction"]],
        [1245620, "ELDEN RING", 5999, 40, ["Souls-like", "RPG", "Difficile"]],
        [367520, "Hollow Knight", 1499, 50, ["Metroidvania", "2D", "Difficile"]],
        [2379780, "Balatro", 1499, 0, ["Roguelike", "Cartes", "Indépendant"]],
        [730, "Counter-Strike 2", 0, 0, ["FPS", "Compétitif", "Tir"]],
        [2868840, "Slay the Spire 2", 2499, 10, ["Roguelike", "Cartes", "Stratégie"]],
      ];
      const terme = String(args?.terme ?? "").toLowerCase();
      const ids = (args?.appIds as number[] | undefined) ?? null;
      let liste = catalogue;
      if (commande === "recherche_magasin") liste = catalogue.filter((c) => c[1].toLowerCase().includes(terme));
      if (commande === "rayon_magasin") liste = args?.rayon === "gratuits" ? catalogue.filter((c) => c[2] === 0) : catalogue.slice(2);
      if (ids) liste = ids.map((id) => catalogue.find((c) => c[0] === id) ?? [id, `Jeu ${id}`, 1999, 0, ["Indépendant"]]);
      return liste.map(([appId, nom, initial, reduction, tags]) => {
        const final_ = Math.round((initial * (100 - reduction)) / 100);
        const t = (c: number) => `${Math.floor(c / 100)},${String(c % 100).padStart(2, "0")} €`;
        const hades = appId === 1145350;
        return {
          appId,
          nom,
          banniere: `${CDN_APERCU}/${appId}/header.jpg`,
          capsule: `${CDN_APERCU}/${appId}/capsule_616x353.jpg`,
          jaquette: `${CDN_APERCU}/${appId}/library_600x900_2x.jpg`,
          hero: `${CDN_APERCU}/${appId}/library_hero.jpg`,
          prix: initial ? { final_, initial, reduction, texteFinal: t(final_), texteInitial: t(initial), finPromo: reduction ? maintenant() + 86400 * 3 : null } : null,
          gratuit: initial === 0,
          sortie: maintenant() - 86400 * 400,
          sortieTexte: null,
          aVenir: false,
          avis: { libelle: "Très positives", pourcentage: 92, nombre: 48_210 },
          tags,
          captures: hades
            ? ["ef0f63061d0a0a9a7e46f3b84f125d25330e8f19", "c88996aa0af82894a8e50ebb951a503ebce3ab24", "b88cb7b48a86f07a7288bf37141f6558279f9bfc", "c8d2b18451a2cc4d5b4fdd78ed84a5e64e051eac"].map(
                (h) => `${SS}/ss_${h}.600x338.jpg?t=1779901265`,
              )
            : [`${CDN_APERCU}/${appId}/header.jpg`],
        };
      });
    }
    case "liste_souhaits":
      return enveloppe([
        { appId: 1245620, priorite: 1, ajouteLe: maintenant() - 86400 * 300 },
        { appId: 367520, priorite: 2, ajouteLe: maintenant() - 86400 * 120 },
        { appId: 413150, priorite: 3, ajouteLe: maintenant() - 86400 * 40 },
        { appId: 1091500, priorite: 0, ajouteLe: maintenant() - 86400 * 10 },
        { appId: 2379780, priorite: 0, ajouteLe: maintenant() - 86400 * 2 },
      ]);
    case "classements": {
      const ids = [730, 578080, 570, 431960, 1145350, 1422450, 1172470, 990080, 2379780, 413150, 1091500, 1245620];
      return enveloppe({
        plusJoues: ids.map((appId, i) => ({ rang: i + 1, appId, rangAvant: i === 1 ? 3 : i === 2 ? 2 : i + 1, valeur: Math.round(1_300_000 / (i + 1)) })),
        meilleuresVentes: [...ids].reverse().map((appId, i) => ({ rang: i + 1, appId, rangAvant: i + 2, valeur: 11 - i })),
      });
    }
    case "en_ligne": {
      const t = maintenant();
      return enveloppe({
        joueurs: 4_118_320,
        releves: Array.from({ length: 30 }, (_, i) => ({
          le: t - (29 - i) * 1800,
          joueurs: Math.round(3_600_000 + 500_000 * Math.sin((i / 30) * Math.PI * 2 - 1.2) + 60_000 * Math.sin(i / 2)),
        })),
      });
    }
    case "profil_joueur": {
      const i = Number(String(args?.steamId).slice(-1));
      const noms = ["Meguru Bachira", "Tututemobile", "AtoxXy", "Furios-KL"];
      const jeux = JEUX.map((j, k) => ({ appId: j.appId, nom: j.nom, minutesTotal: j.minutes * (k + i + 1), minutesDeuxSemaines: k < 2 ? 300 : 0, icone: "", dernierLancement: maintenant() - 86400 * k }));
      return enveloppe({
        joueur: {
          steamId: String(args?.steamId), pseudo: noms[i] ?? "Ami", avatar: "", urlProfil: "https://steamcommunity.com/id/ami/",
          etat: i < 2 ? 1 : 0, visibilite: 3, nomReel: null, pays: "FR", jeuEnCours: i === 0 ? "Apex Legends" : null, jeuEnCoursId: i === 0 ? "1172470" : null,
          derniereDeconnexion: maintenant() - 3600, lobby: null, serveur: null,
        },
        niveau: { niveau: 23 + i, xp: 4200, xpNiveauActuel: 4000, xpPourSuivant: 300, badges: [{ id: 1, appId: null, niveau: 6, xp: 300, obtenuLe: maintenant() - 86400 * 30, rarete: 0 }] },
        jeux: i === 3 ? null : jeux,
        recents: jeux.filter((j) => j.minutesDeuxSemaines > 0),
      });
    }
    // ——— Communauté ———
    case "workshop_installe":
      return [
        {
          appId: 1145350,
          taille: 9_766_000_000,
          nombre: 196,
          majEnAttente: 2,
          ids: [
            ...Array.from({ length: 196 }, (_, i) => String(3_000_000_000 + i)),
            ...[...ABONNEMENTS_APERCU].filter(([, debut]) => Date.now() - debut >= 6000).map(([id]) => id),
          ],
        },
        { appId: 730, taille: 412_000_000, nombre: 53, majEnAttente: 0, ids: Array.from({ length: 53 }, (_, i) => String(3_000_000_000 + i)) },
      ];
    case "mods_jeu": {
      const page = Number(args?.page ?? 0);
      const total = Number(args?.appId) === 730 ? 53 : 196;
      const n = Math.max(0, Math.min(40, total - page * 40));
      return {
        total,
        taille: total * 48_000_000,
        mods: Array.from({ length: n }, (_, k) => {
          const i = page * 40 + k;
          return {
            id: String(3_000_000_000 + i),
            taille: 12_000_000 + ((i * 7_919_000) % 380_000_000),
            maj: maintenant() - i * 86_400 * 3,
            aMettreAJour: i < 2,
            objet: objetFactice(i, Number(args?.appId)),
          };
        }),
      };
    }
    case "vitrine_workshop": {
      const page = Number(args?.page ?? 1);
      const genre = String(args?.genre ?? "objets");
      const recherche = String(args?.recherche ?? "");
      const total = recherche ? 12 : 3_271_050;
      return enveloppe({
        total,
        objets: Array.from({ length: recherche ? 12 : 30 }, (_, k) => {
          const o = objetFactice((page - 1) * 30 + k + 192, Number(args?.appId));
          return genre === "videos" ? { ...o, video: "dQw4w9WgXcQ" } : genre === "guides" ? { ...o, titre: `Guide : ${o.titre}` } : o;
        }),
      });
    }
    case "mes_captures":
      return [1145350, 1903340, 990080].map((appId, j) => ({
        appId,
        captures: CAPTURES_FACTICES.slice(0, 4 - j).map((h, i) => ({
          fichier: `${CDN_APERCU}/${appId === 1145350 ? 1145350 : 1145350}/ss_${h}.1920x1080.jpg?t=1779901265`,
          miniature: `${CDN_APERCU}/1145350/ss_${h}.600x338.jpg?t=1779901265`,
          largeur: 2560,
          hauteur: 1440,
          date: maintenant() - (j * 10 + i) * 86_400,
        })),
      }));
    case "ouvrir_captures":
    case "ouvrir_objet_workshop":
    case "ouvrir_youtube":
    case "ouvrir_salon":
    case "salon_action":
      return null;
    case "salon_etat":
      // `?salon=barre&page=connexion` : la barre sur la page de connexion de Steam.
      if (new URLSearchParams(location.search).get("page") === "connexion")
        return { url: "https://store.steampowered.com/login/?redir=cart%2F", hote: "store.steampowered.com", officiel: true, securise: true, titre: "Connexion", chargement: false };
      return { url: "https://store.steampowered.com/app/1145350/Hades_II/", hote: "store.steampowered.com", officiel: true, securise: true, titre: "Hades II sur Steam", chargement: false };
    case "fiche_mod": {
      const i = Number(String(args?.id ?? "0").slice(-3)) || 0;
      const o = objetFactice(i, Number(args?.appId));
      return {
        objet: {
          ...o,
          description: `${o.description} Réglages : vitesse, couleurs, musique. Fonctionne en 1080p, 1440p et 4K.`,
          // Un objet sur trois n'a qu'un petit aperçu (comme les GIF de 250 px des fonds « scène »).
          galerie: i % 3 === 0 ? [] : CAPTURES_FACTICES.map((h) => `${CDN_APERCU}/1145350/ss_${h}.1920x1080.jpg?t=1779901265`),
          ...(i % 3 === 0 ? { apercu: `${CDN_APERCU}/1145350/capsule_231x87.jpg` } : {}),
          youtube: i % 3 === 0 ? [] : ["dxy1pQRu9Po"],
        },
        local: null,
      };
    }
    case "abonner_mod": {
      const id = String(args?.id);
      if (args?.abonner) ABONNEMENTS_APERCU.set(id, Date.now());
      else ABONNEMENTS_APERCU.delete(id);
      return null;
    }
    case "etat_mod": {
      const debut = ABONNEMENTS_APERCU.get(String(args?.id));
      if (debut == null) return { installe: false, recu: 0 };
      const f = Math.min(1, (Date.now() - debut) / 6000);
      return { installe: f >= 1, recu: Math.round(f * 120_000_000) };
    }
    case "fil_amis": {
      const recents = [
        [{ appId: 1145350, nom: "Hades II", m: 760 }, { appId: 730, nom: "Counter-Strike 2", m: 120 }],
        [{ appId: 1145350, nom: "Hades II", m: 420 }, { appId: 1903340, nom: "Clair Obscur: Expedition 33", m: 300 }],
        [{ appId: 730, nom: "Counter-Strike 2", m: 1500 }],
        [],
      ];
      const amis = (donneesApercu("amis") as { donnees: { amis: Record<string, unknown>[] } }).donnees.amis;
      return amis.map((a, i) => ({
        joueur: { ...a, jeuEnCoursId: i === 0 ? "1172470" : i === 1 ? "1145350" : null },
        recents: recents[i].map((r) => ({ appId: r.appId, nom: r.nom, minutesTotal: r.m * 4, minutesDeuxSemaines: r.m, icone: "", dernierLancement: maintenant() - 7200 * (i + 1) })),
      }));
    }
    case "objets_profil":
      return enveloppe({
        fond: { nom: "The Crossroads Between Realms", image: "https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/items/1145350/4c9456badc54af712d6cb4398ab4c194dc523ed1.jpg", videoWebm: "https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/items/1145350/6953b75620c178917da85926d91bade8ad7d1f38.webm", videoMp4: null },
        miniFond: null,
        cadre: { nom: "Ghostly Frame", image: "https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/items/1145350/7e753023f517ba01d4fd5d4031d69addb68751f5.png", videoWebm: null, videoMp4: null },
        avatarAnime: null,
      });
    case "amis_possedant":
      return ["76561198000000100", "76561198000000101", "76561198000000103"];
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
