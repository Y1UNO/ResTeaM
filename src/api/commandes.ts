import { invoke } from "@tauri-apps/api/core";
import {
  estErreurApp,
  type ActionSteam,
  type Actu,
  type Bibliotheque,
  type Collections,
  type AvisJeu,
  type ConfigPc,
  type DemandeInstallation,
  type FicheJeu,
  type VitrineMagasin,
  type FileSteam,
  type Donnee,
  type ImagesJeu,
  type ErreurApp,
  type InfosSteamLocal,
  type JeuInstalle,
  type JeuPossede,
  type Joueur,
  type ListeAmis,
  type NiveauBadges,
  type OptionsInstallation,
  type PatchNotes,
  type Session,
  type StatsSysteme,
  type SuccesJeu,
} from "./types";

/** Vrai dans l'exe (WebView de Tauri), faux dans un simple navigateur. */
export const dansTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function appeler<T>(commande: string, args?: Record<string, unknown>): Promise<T> {
  if (!dansTauri) {
    // Aperçu dans un navigateur (vérification visuelle) : faux back-end en mémoire.
    const { apercu } = await import("./apercu");
    return apercu<T>(commande, args);
  }
  try {
    return await invoke<T>(commande, args);
  } catch (e) {
    if (estErreurApp(e)) throw e;
    const inconnue: ErreurApp = { code: "interne", message: String(e) };
    throw inconnue;
  }
}

/** Appels typés vers le Rust. La clé API n'est jamais lue : on sait seulement si elle existe. */
export const api = {
  sessionLire: () => appeler<Session | null>("session_lire"),
  connexionSteam: () => appeler<Session>("connexion_steam"),
  connexionAnnuler: () => appeler<void>("connexion_annuler"),
  deconnexion: () => appeler<void>("deconnexion"),
  cleEtat: () => appeler<boolean>("cle_etat"),
  cleEnregistrer: (cle: string) => appeler<void>("cle_enregistrer", { cle }),
  cleSupprimer: () => appeler<void>("cle_supprimer"),
  ouvrirPageCleApi: () => appeler<void>("ouvrir_page_cle_api"),
  joueurMoi: () => appeler<Donnee<Joueur>>("joueur_moi"),

  // Lecture locale (sans réseau)
  steamLocal: () => appeler<InfosSteamLocal>("steam_local"),
  jeuxInstalles: () => appeler<JeuInstalle[]>("jeux_installes"),
  collections: () => appeler<Collections>("collections"),

  // Données du compte (Web API, avec cache Rust)
  bibliotheque: () => appeler<Donnee<Bibliotheque>>("bibliotheque"),
  recemmentJoues: () => appeler<Donnee<JeuPossede[]>>("recemment_joues"),
  niveauBadges: () => appeler<Donnee<NiveauBadges>>("niveau_badges"),
  amis: () => appeler<Donnee<ListeAmis>>("amis"),
  succesJeu: (appId: number) => appeler<Donnee<SuccesJeu | null>>("succes_jeu", { appId }),
  actusJeu: (appId: number) => appeler<Donnee<Actu[]>>("actus_jeu", { appId }),

  // Accueil
  imagesJeux: (appIds: number[]) => appeler<Record<string, ImagesJeu>>("images_jeux", { appIds }),
  patchNotes: (appId: number) => appeler<Donnee<PatchNotes | null>>("patch_notes", { appId }),
  steamLien: (action: ActionSteam) => appeler<void>("steam_lien", { action }),

  // Installation sans la fenêtre de Steam
  optionsInstallation: (appId: number, nom: string) =>
    appeler<OptionsInstallation>("options_installation", { appId, nom }),
  installerJeu: (d: DemandeInstallation) => appeler<FileSteam>("installer_jeu", d),
  desinstallerJeu: (appId: number) => appeler<FileSteam>("desinstaller_jeu", { appId }),
  fileSteam: () => appeler<FileSteam>("file_steam"),
  annulerFileSteam: (appId: number) => appeler<FileSteam>("annuler_file_steam", { appId }),
  ficheJeu: (appId: number) => appeler<Donnee<FicheJeu>>("fiche_jeu", { appId }),
  avisJeu: (appId: number) => appeler<Donnee<AvisJeu>>("avis_jeu", { appId }),
  vitrineMagasin: () => appeler<Donnee<VitrineMagasin>>("vitrine_magasin"),
  configPc: () => appeler<ConfigPc>("config_pc"),
  statsSysteme: () => appeler<StatsSysteme>("stats_systeme"),
};
