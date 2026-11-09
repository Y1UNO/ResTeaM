import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/commandes";
import { estErreurApp, type ProfilPartage } from "../../api/types";
import { viaCache } from "../../lib/imageLocale";
import type { Personnalisation } from "./Personnalisation";

/** Ce qui part sur le serveur : les choix du pinceau magique (jamais les adresses locales). */
export function styleAPartager(p: Personnalisation) {
  return { fond: p.fond, cadre: p.cadre, effet: p.effet, accent: p.accent, avatarAnime: p.avatarAnime, jeuFond: p.jeuFond };
}

/** Personnalisation d'un ami à partir de son profil partagé. */
export function persoDepuisPartage(base: Personnalisation, profil: ProfilPartage | null | undefined): Personnalisation {
  if (!profil) return base;
  const s = profil.style;
  return {
    ...base,
    ...(s.fond ? { fond: s.fond } : {}),
    ...(s.cadre ? { cadre: s.cadre } : {}),
    ...(s.effet ? { effet: s.effet } : {}),
    ...(s.accent ? { accent: s.accent } : {}),
    ...(typeof s.avatarAnime === "boolean" ? { avatarAnime: s.avatarAnime } : {}),
    jeuFond: s.jeuFond ?? null,
    // La photo passe par le cache disque (une fois par version), la bannière est lue en direct.
    avatarPerso: profil.avatar ? viaCache(profil.avatar.url) : null,
    bannierePerso: profil.banniere?.url ?? null,
    bannierePersoVideo: !!profil.banniere?.video,
  };
}

const CLE_ENVOYE = "resteam.partage.envoye";
type Envoye = { style?: string; avatar?: string | null; banniere?: string | null };

function lireEnvoye(): Envoye {
  try {
    return JSON.parse(localStorage.getItem(CLE_ENVOYE) ?? "{}") as Envoye;
  } catch {
    return {};
  }
}
function garderEnvoye(e: Envoye) {
  try {
    localStorage.setItem(CLE_ENVOYE, JSON.stringify(e));
  } catch {
    /* rien : tout sera renvoyé la prochaine fois */
  }
}

/**
 * « Partager mon profil ResTeaM » dans le pinceau magique. Coupé par défaut.
 * Une fois actif, chaque changement de style, de photo ou de bannière part sur le
 * serveur (après un court délai), et seulement ce qui a changé.
 */
export function PartageProfil({ p }: { p: Personnalisation }) {
  const client = useQueryClient();
  const etat = useQuery({ queryKey: ["partage"], queryFn: api.partageEtat, staleTime: 60_000 });
  const actif = !!etat.data;
  const [action, setAction] = useState<"connexion" | "arret" | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const minuterie = useRef<number | undefined>(undefined);

  // Synchronisation : style, puis fichiers, seulement ce qui a changé depuis le dernier envoi.
  useEffect(() => {
    if (!actif) return;
    window.clearTimeout(minuterie.current);
    minuterie.current = window.setTimeout(async () => {
      const deja = lireEnvoye();
      const style = JSON.stringify(styleAPartager(p));
      const taches: [keyof Envoye, () => Promise<unknown>, string | null][] = [];
      if (deja.style !== style) taches.push(["style", () => api.partagePublier(styleAPartager(p)), style]);
      for (const nom of ["avatar", "banniere"] as const) {
        const local = nom === "avatar" ? p.avatarPerso : p.bannierePerso;
        if ((deja[nom] ?? null) !== local) {
          taches.push([nom, () => (local ? api.partageFichier(nom) : api.partageRetirerFichier(nom)), local]);
        }
      }
      if (!taches.length) return;
      setEnvoi(true);
      setMessage(null);
      try {
        for (const [cle, faire, valeur] of taches) {
          await faire();
          garderEnvoye({ ...lireEnvoye(), [cle]: valeur });
        }
      } catch (e) {
        setMessage(estErreurApp(e) ? e.message : String(e));
      } finally {
        setEnvoi(false);
      }
    }, 1200);
    return () => window.clearTimeout(minuterie.current);
  }, [actif, p]);

  const activer = async () => {
    setAction("connexion");
    setMessage(null);
    try {
      garderEnvoye({});
      const profil = await api.partageConnecter();
      client.setQueryData(["partage"], profil);
    } catch (e) {
      setMessage(estErreurApp(e) ? e.message : String(e));
    } finally {
      setAction(null);
    }
  };

  const arreter = async () => {
    setAction("arret");
    setMessage(null);
    try {
      await api.partageArreter();
      garderEnvoye({});
      client.setQueryData(["partage"], null);
      setConfirmer(false);
    } catch (e) {
      setMessage(estErreurApp(e) ? e.message : String(e));
    } finally {
      setAction(null);
    }
  };

  return (
    <div className={`perso__groupe partage${actif ? " is-actif" : ""}`}>
      <span className="perso__titre">Partager avec mes amis</span>
      {etat.isLoading ? (
        <p className="perso__note">Lecture du partage…</p>
      ) : actif ? (
        <>
          <div className="partage__etat" role="status">
            <span className={`partage__point${envoi ? " is-envoi" : ""}`} aria-hidden="true" />
            {envoi ? "Envoi au serveur…" : "Partagé : tes amis qui ont ResTeaM voient ta photo, ta bannière et tes styles."}
          </div>
          {confirmer ? (
            <div className="partage__boutons">
              <span>Tout effacer du serveur ?</span>
              <button type="button" className="btn btn--secondaire btn--petit" onClick={() => setConfirmer(false)}>
                Garder
              </button>
              <button type="button" className="btn btn--principal btn--petit" disabled={action === "arret"} onClick={() => void arreter()}>
                {action === "arret" ? "Effacement…" : "Arrêter le partage"}
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn--lien partage__arreter" onClick={() => setConfirmer(true)}>
              Arrêter le partage
            </button>
          )}
        </>
      ) : (
        <>
          <p className="perso__note">
            Tes amis qui ont ResTeaM verront ta photo, ta bannière et tes styles. Connexion avec Steam dans ton navigateur ; ta clé API n’est jamais envoyée.
          </p>
          <button type="button" className="btn btn--secondaire btn--petit" disabled={action === "connexion"} onClick={() => void activer()}>
            {action === "connexion" ? "Valide dans ton navigateur…" : "Partager mon profil"}
          </button>
        </>
      )}
      {message && <p className="message">{message}</p>}
    </div>
  );
}
