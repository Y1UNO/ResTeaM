import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/commandes";
import { useParametresSteam } from "../../api/requetes";
import { estErreurApp, type ParametresSteam, type ReglageSteam } from "../../api/types";
import { taille } from "../../lib/format";
import "./ParametresSteam.css";

/** Limites proposées, en Mo/s (1 Mo/s = 8 000 kbit/s, l'unité de Steam). */
const LIMITES = [0, 2, 5, 10, 25, 50];
const KBPS_PAR_MO = 8000;

type Brouillon = { limiteKbps: number; telechargementsEnJeu: boolean; ralentirStreaming: boolean; overlay: boolean };
const CHAMPS: (keyof Brouillon)[] = ["limiteKbps", "telechargementsEnJeu", "ralentirStreaming", "overlay"];

/** Valeurs vues par Tom : celles du disque, remplacées par celles en attente. */
function effectif(p: ParametresSteam, attente: ReglageSteam | null): Brouillon {
  return {
    limiteKbps: attente?.limiteKbps ?? p.limiteKbps,
    telechargementsEnJeu: attente?.telechargementsEnJeu ?? p.telechargementsEnJeu,
    ralentirStreaming: attente?.ralentirStreaming ?? p.ralentirStreaming,
    overlay: attente?.overlay ?? p.overlay,
  };
}

function libelleLimite(kbps: number): string {
  if (!kbps) return "Sans limite";
  const mo = kbps / KBPS_PAR_MO;
  return `${Number.isInteger(mo) ? mo : mo.toFixed(1).replace(".", ",")} Mo/s`;
}

/**
 * Paramètres de Steam réglés depuis ResTeaM. Steam réécrit ses fichiers en se fermant :
 * les changements partent dans la file, et Steam redémarre caché (après le jeu en cours)
 * pour les écrire. Le démarrage avec Windows, lui, s'applique tout de suite.
 */
export function ParametresSteamBloc() {
  const requete = useParametresSteam();
  const client = useQueryClient();
  const donnees = requete.data;
  const base = useMemo(() => (donnees ? effectif(donnees.parametres, donnees.enAttente) : null), [donnees]);
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [autre, setAutre] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // Nouveau point de départ quand les données changent (file appliquée, autre fenêtre).
  useEffect(() => {
    if (base) setBrouillon(base);
  }, [base]);

  if (requete.isError) {
    return (
      <section className="carte parametres__bloc" aria-labelledby="p-steam">
        <h2 id="p-steam" className="carte__titre">
          Steam
        </h2>
        <p className="message">{estErreurApp(requete.error) ? requete.error.message : "Paramètres de Steam illisibles."}</p>
      </section>
    );
  }
  if (!donnees || !brouillon || !base) {
    return (
      <section className="carte parametres__bloc psteam psteam--charge" aria-label="Paramètres de Steam (chargement)">
        <div className="psteam__squelette" />
      </section>
    );
  }

  const p = donnees.parametres;
  const modifies = CHAMPS.filter((c) => brouillon[c] !== base[c]);
  const enAttente = donnees.enAttente;
  const phase = donnees.file.phase;
  const changer = <K extends keyof Brouillon>(c: K, v: Brouillon[K]) => setBrouillon({ ...brouillon, [c]: v });
  const limiteLibre = !LIMITES.some((l) => l * KBPS_PAR_MO === brouillon.limiteKbps);

  const appliquer = async () => {
    setEnvoi(true);
    setMessage(null);
    try {
      const demande: Omit<ReglageSteam, "compte"> = { limiteKbps: null, telechargementsEnJeu: null, ralentirStreaming: null, overlay: null };
      for (const c of modifies) (demande as Record<string, unknown>)[c] = brouillon[c];
      await api.reglerSteam(demande);
      await client.invalidateQueries({ queryKey: ["parametres-steam"] });
      void client.invalidateQueries({ queryKey: ["file-steam"] });
    } catch (e) {
      setMessage(estErreurApp(e) ? e.message : String(e));
    } finally {
      setEnvoi(false);
    }
  };

  const annuler = async () => {
    try {
      await api.annulerReglageSteam();
      await client.invalidateQueries({ queryKey: ["parametres-steam"] });
    } catch (e) {
      setMessage(estErreurApp(e) ? e.message : String(e));
    }
  };

  const demarrage = async (actif: boolean) => {
    try {
      await api.steamAuDemarrage(actif);
      await client.invalidateQueries({ queryKey: ["parametres-steam"] });
    } catch (e) {
      setMessage(estErreurApp(e) ? e.message : String(e));
    }
  };

  return (
    <section className="carte parametres__bloc psteam" aria-labelledby="p-steam">
      <div className="psteam__entete">
        <h2 id="p-steam" className="carte__titre">
          Steam
        </h2>
        <span className="psteam__note">Écrit par ResTeaM quand Steam est fermé, avec une copie de sauvegarde.</span>
      </div>

      <div className="psteam__groupe">
        <h3>Téléchargements</h3>
        <div className="psteam__ligne psteam__ligne--haut">
          <span className="psteam__texte">
            <strong>Limite de débit</strong>
            <span>Actuellement : {libelleLimite(base.limiteKbps)}</span>
          </span>
          <div className="psteam__puces" role="radiogroup" aria-label="Limite de débit">
            {LIMITES.map((l) => {
              const actif = brouillon.limiteKbps === l * KBPS_PAR_MO;
              return (
                <button key={l} type="button" role="radio" aria-checked={actif} className={`psteam__puce${actif ? " is-actif" : ""}`} onClick={() => changer("limiteKbps", l * KBPS_PAR_MO)}>
                  {l ? `${l} Mo/s` : "Sans limite"}
                </button>
              );
            })}
            <label className={`psteam__autre${limiteLibre ? " is-actif" : ""}`}>
              <input
                type="number"
                min={0.1}
                max={1000}
                step={0.1}
                inputMode="decimal"
                placeholder="Autre"
                value={limiteLibre && !autre ? String(brouillon.limiteKbps / KBPS_PAR_MO) : autre}
                onChange={(e) => {
                  setAutre(e.target.value);
                  const mo = Number(e.target.value.replace(",", "."));
                  if (mo > 0 && mo <= 1000) changer("limiteKbps", Math.round(mo * KBPS_PAR_MO));
                }}
                aria-label="Autre limite, en Mo/s"
              />
              <span>Mo/s</span>
            </label>
          </div>
        </div>
        <Interrupteur
          titre="Télécharger pendant que je joue"
          detail="Sinon, Steam met les téléchargements en pause tant qu’un jeu tourne."
          actif={brouillon.telechargementsEnJeu}
          onChange={(v) => changer("telechargementsEnJeu", v)}
        />
        <Interrupteur
          titre="Ralentir pendant le streaming"
          detail="Garde une bonne qualité de Remote Play en limitant les téléchargements."
          actif={brouillon.ralentirStreaming}
          onChange={(v) => changer("ralentirStreaming", v)}
        />
      </div>

      <div className="psteam__groupe">
        <h3>En jeu</h3>
        <Interrupteur
          titre="Overlay de Steam"
          detail="Maj + Tab en jeu : amis, navigateur, captures. Pour ce compte."
          actif={brouillon.overlay}
          onChange={(v) => changer("overlay", v)}
        />
      </div>

      {(modifies.length > 0 || enAttente) && (
        <div className={`psteam__file${phase === "redemarrage" ? " is-actif" : ""}`} role="status">
          <span className="psteam__lune" aria-hidden="true" />
          <span className="psteam__file-texte">
            {modifies.length > 0
              ? `${modifies.length} changement${modifies.length > 1 ? "s" : ""} à appliquer. Steam redémarrera caché pour les écrire${phase === "attenteJeu" ? ", après ton jeu en cours" : ""}.`
              : phase === "redemarrage"
                ? "Steam redémarre pour écrire tes paramètres…"
                : phase === "attenteJeu"
                  ? "En attente : Steam redémarrera caché dès que ton jeu sera fermé."
                  : "En attente du redémarrage de Steam…"}
          </span>
          {modifies.length > 0 ? (
            <>
              <button type="button" className="btn btn--lien" onClick={() => setBrouillon(base)}>
                Rétablir
              </button>
              <button type="button" className="btn btn--principal btn--petit" disabled={envoi} onClick={appliquer}>
                {envoi ? "Envoi…" : "Appliquer"}
              </button>
            </>
          ) : (
            phase !== "redemarrage" && (
              <button type="button" className="btn btn--secondaire btn--petit" onClick={annuler}>
                Annuler
              </button>
            )
          )}
        </div>
      )}

      <div className="psteam__groupe">
        <h3>Démarrage</h3>
        <Interrupteur
          titre="Lancer Steam avec Windows"
          detail="Caché, comme le fait Steam. Appliqué tout de suite."
          actif={p.demarrageWindows}
          onChange={(v) => void demarrage(v)}
        />
      </div>

      <div className="psteam__groupe">
        <h3>Disques et bibliothèques</h3>
        <ul className="psteam__disques">
          {p.bibliotheques.map((b) => {
            const pris = b.disque.total ? 1 - b.disque.libre / b.disque.total : 0;
            return (
              <li key={b.disque.bibliotheque} className="psteam__disque">
                <span className="psteam__lecteur">{b.disque.lecteur}</span>
                <span className="psteam__disque-infos">
                  <strong title={b.disque.bibliotheque}>
                    {b.disque.nom || "Disque local"} · {b.nombreJeux} jeu{b.nombreJeux > 1 ? "x" : ""}
                  </strong>
                  <span className="psteam__jauge" aria-hidden="true">
                    <span style={{ transform: `scaleX(${Math.min(1, Math.max(0.02, pris))})` }} />
                  </span>
                  <span>
                    {taille(b.disque.libre)} libres sur {taille(b.disque.total)} · {b.disque.bibliotheque}
                  </span>
                </span>
                <button type="button" className="btn btn--secondaire btn--petit" onClick={() => void api.ouvrirBibliothequeSteam(b.disque.bibliotheque).catch(() => {})}>
                  Ouvrir
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {message && <p className="message">{message}</p>}
    </section>
  );
}

export function Interrupteur({ titre, detail, actif, onChange }: { titre: string; detail: string; actif: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={actif} className={`psteam__ligne interrupteur${actif ? " is-actif" : ""}`} onClick={() => onChange(!actif)}>
      <span className="psteam__texte">
        <strong>{titre}</strong>
        <span>{detail}</span>
      </span>
      <span className="interrupteur__rail" aria-hidden="true">
        <span className="interrupteur__lune" />
      </span>
    </button>
  );
}
