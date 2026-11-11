import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/commandes";
import { estErreurApp, type Preferences } from "../../api/types";
import { Interrupteur } from "./ParametresSteam";
import "./ParametresSteam.css";

type CleInterrupteur = { [K in keyof Preferences]: Preferences[K] extends boolean ? K : never }[keyof Preferences];
type Ligne = { cle: CleInterrupteur; titre: string; detail: string };
const COINS: [Preferences["notifCoin"], string][] = [
  ["bd", "Bas droite"],
  ["hd", "Haut droite"],
  ["bg", "Bas gauche"],
  ["hg", "Haut gauche"],
];

const REMPLACER: Ligne[] = [
  { cle: "fermerReduit", titre: "Fermer = garder dans la zone de notification", detail: "Le × range ResTeaM près de l’horloge. « Quitter ResTeaM » dans son menu le ferme vraiment." },
  { cle: "steamCache", titre: "Lancer Steam caché avec ResTeaM", detail: "Steam démarre derrière, sans sa fenêtre, s’il ne tourne pas déjà." },
  { cle: "reduireEnJeu", titre: "Me laisser jouer", detail: "ResTeaM se réduit quand un jeu se lance, puis revient quand il se ferme." },
];

const NOTIFICATIONS: Ligne[] = [
  { cle: "notifTelechargement", titre: "Téléchargement terminé", detail: "Un jeu est prêt à jouer." },
  { cle: "notifMaj", titre: "Mise à jour prête", detail: "Un jeu installé vient d’être mis à jour." },
  { cle: "notifAmi", titre: "Un ami lance un jeu", detail: "Quand un ami passe « en jeu »." },
  { cle: "notifPromo", titre: "Promo dans ma liste de souhaits", detail: "Un jeu de ta liste de souhaits passe en promotion." },
];

/** Préférences de ResTeaM : remplacer Steam au quotidien, et notifications Windows. */
export function ParametresResteam() {
  const client = useQueryClient();
  const requete = useQuery({ queryKey: ["preferences"], queryFn: api.preferencesLire, staleTime: 0 });
  const [message, setMessage] = useState<string | null>(null);
  const [essai, setEssai] = useState(false);
  /** Résultat de la dernière sauvegarde ou reprise (« encours » pendant l'opération). */
  const [sauvegarde, setSauvegarde] = useState<string | null>(null);
  const d = requete.data;

  const changer = async <K extends keyof Preferences>(cle: K, valeur: Preferences[K]) => {
    if (!d) return;
    const preferences = { ...d.preferences, [cle]: valeur };
    client.setQueryData(["preferences"], { ...d, preferences });
    try {
      await api.preferencesEcrire(preferences);
    } catch (e) {
      setMessage(estErreurApp(e) ? e.message : String(e));
      void client.invalidateQueries({ queryKey: ["preferences"] });
    }
  };

  /** Sauvegarde (ou reprise) des notes et du journal, dans Documents\ResTeaM. */
  const sauvegarder = async (sens: "exporter" | "importer") => {
    setSauvegarde("encours");
    const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;
    try {
      if (sens === "exporter") {
        const b = await api.sauvegardeExporter();
        setSauvegarde(`Sauvegarde enregistrée : ${pluriel(b.notes, "note")} et ${pluriel(b.sessions, "partie")}.`);
      } else {
        const b = await api.sauvegardeImporter();
        setSauvegarde(b.notes + b.sessions === 0 ? "Tout y était déjà : rien à reprendre." : `Repris : ${pluriel(b.notes, "note")} et ${pluriel(b.sessions, "partie")}.`);
        // Les pages déjà ouvertes (carnet, journal) relisent leurs données.
        void client.invalidateQueries();
      }
    } catch (e) {
      setSauvegarde(estErreurApp(e) ? e.message : String(e));
    }
  };

  const demarrage = async (actif: boolean) => {
    try {
      await api.resteamAuDemarrage(actif);
    } catch (e) {
      setMessage(estErreurApp(e) ? e.message : String(e));
    }
    void client.invalidateQueries({ queryKey: ["preferences"] });
  };

  return (
    <section className="carte parametres__bloc psteam" aria-labelledby="p-resteam">
      <div className="psteam__entete">
        <h2 id="p-resteam" className="carte__titre">
          ResTeaM au quotidien
        </h2>
        <span className="psteam__note">ResTeaM à la place de Steam, du démarrage à la fin de la partie.</span>
      </div>
      {d ? (
        <>
          <div className="psteam__groupe">
            <h3>Remplacer Steam</h3>
            <Interrupteur
              titre="Lancer ResTeaM avec Windows"
              detail="Directement dans la zone de notification, sans fenêtre. Appliqué tout de suite."
              actif={d.demarrageWindows}
              onChange={(v) => void demarrage(v)}
            />
            {REMPLACER.map((l) => (
              <Interrupteur key={l.cle} titre={l.titre} detail={l.detail} actif={d.preferences[l.cle]} onChange={(v) => void changer(l.cle, v)} />
            ))}
          </div>
          <div className="psteam__groupe">
            <h3>Notifications</h3>
            {NOTIFICATIONS.map((l) => (
              <Interrupteur key={l.cle} titre={l.titre} detail={l.detail} actif={d.preferences[l.cle]} onChange={(v) => void changer(l.cle, v)} />
            ))}
            <Interrupteur
              titre="Ne pas déranger en jeu"
              detail="Pendant une partie, rien ne s’affiche : les notifications attendent la fin du jeu."
              actif={d.preferences.notifPasEnJeu}
              onChange={(v) => void changer("notifPasEnJeu", v)}
            />
            <div className="psteam__ligne psteam__ligne--haut">
              <span className="psteam__texte">
                <strong>Coin de l’écran</strong>
                <span>Où les cartes apparaissent.</span>
              </span>
              <div className="psteam__puces" role="radiogroup" aria-label="Coin de l’écran">
                {COINS.map(([v, libelle]) => (
                  <button key={v} type="button" role="radio" aria-checked={d.preferences.notifCoin === v} className={`psteam__puce${d.preferences.notifCoin === v ? " is-actif" : ""}`} onClick={() => void changer("notifCoin", v)}>
                    {libelle}
                  </button>
                ))}
              </div>
            </div>
            <div className="psteam__ligne psteam__ligne--haut">
              <span className="psteam__texte">
                <strong>Durée d’affichage</strong>
                <span>La carte reste tant que la souris est dessus.</span>
              </span>
              <div className="psteam__puces" role="radiogroup" aria-label="Durée d’affichage">
                {[5, 7, 10, 15].map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={d.preferences.notifDuree === s} className={`psteam__puce${d.preferences.notifDuree === s ? " is-actif" : ""}`} onClick={() => void changer("notifDuree", s)}>
                    {s} s
                  </button>
                ))}
              </div>
            </div>
            <div className="psteam__essai">
              <button
                type="button"
                className="btn btn--secondaire btn--petit"
                onClick={() => {
                  void api.notificationEssai().catch(() => {});
                  setEssai(true);
                }}
              >
                Envoyer une notification d’essai
              </button>
              {essai && <span>Elle apparaît dans le coin choisi, même pendant une partie.</span>}
            </div>
          </div>
          <div className="psteam__groupe">
            <h3>Mes notes et mon journal</h3>
            <div className="psteam__ligne psteam__ligne--haut">
              <span className="psteam__texte">
                <strong>Sauvegarde</strong>
                <span>
                  Tes notes par jeu et ton journal de jeu sont chiffrés sur ce PC : une réinstallation de Windows les rendrait illisibles. La sauvegarde est un
                  fichier lisible, rangé dans Documents\ResTeaM. Garde-le en lieu sûr.
                </span>
              </span>
            </div>
            <div className="psteam__essai">
              <button type="button" className="btn btn--secondaire btn--petit" disabled={sauvegarde === "encours"} onClick={() => void sauvegarder("exporter")}>
                Enregistrer une sauvegarde
              </button>
              <button type="button" className="btn btn--secondaire btn--petit" disabled={sauvegarde === "encours"} onClick={() => void sauvegarder("importer")}>
                Reprendre la sauvegarde
              </button>
              {sauvegarde !== "encours" && sauvegarde && <span>{sauvegarde}</span>}
            </div>
          </div>
        </>
      ) : (
        <div className="psteam__squelette" style={{ minHeight: 180 }} />
      )}
      {message && <p className="message">{message}</p>}
    </section>
  );
}
