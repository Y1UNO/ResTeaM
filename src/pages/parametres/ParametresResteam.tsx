import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/commandes";
import { estErreurApp, type Preferences } from "../../api/types";
import { Interrupteur } from "./ParametresSteam";
import "./ParametresSteam.css";

type Ligne = { cle: keyof Preferences; titre: string; detail: string };

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
  const d = requete.data;

  const changer = async (cle: keyof Preferences, valeur: boolean) => {
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
            <h3>Notifications Windows</h3>
            {NOTIFICATIONS.map((l) => (
              <Interrupteur key={l.cle} titre={l.titre} detail={l.detail} actif={d.preferences[l.cle]} onChange={(v) => void changer(l.cle, v)} />
            ))}
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
              {essai && <span>Elle apparaît en bas à droite de l’écran.</span>}
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
