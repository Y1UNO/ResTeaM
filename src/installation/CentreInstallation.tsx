import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/commandes";
import { useFileSteam, useJeuxInstalles, useNomJeu, useStatsSysteme } from "../api/requetes";
import { estErreurApp, type Disque, type Installation } from "../api/types";
import { usePalette } from "../lib/couleurs";
import { taille } from "../lib/format";
import { debit, dureeRestante, useVitesse } from "../lib/telechargement";
import {
  AnneauProgression,
  BarreLiane,
  DefsLianes,
  EngrenageDisque,
  LianeCote,
  LianeHautChoix,
  LianeHautSuivi,
} from "./Lianes";
import { useDebitsPc, useEstimationReseau } from "./mesures";
import { useInstallation } from "./store";
import "./installation.css";

/** Marge de sécurité sur l'estimation du magasin. */
const MARGE = 1.1;
const DUREE_SORTIE = 450;

const POUSSIERES = Array.from({ length: 14 }, (_, i) => ({
  left: `${6 + i * 6.7}%`,
  bottom: `${-2 - (i % 3) * 4}%`,
  size: i % 3 === 0 ? 5 : 3,
  duree: `${11 + ((i * 7) % 9)}s`,
  delai: `${-i * 1.3}s`,
}));

function nomDisque(d: Disque): string {
  return d.nom ? `${d.nom} (${d.lecteur})` : `Disque local (${d.lecteur})`;
}

/**
 * Centre d'installation (design de Tom) : fenêtre de choix du disque, suivi du
 * téléchargement avec la liane qui pousse, état « Prêt à jouer », et pastille
 * réduite en bas à droite. Monté une seule fois, visible sur toutes les pages.
 */
export function CentreInstallation() {
  const jeu = useInstallation((s) => s.jeu);
  return (
    <>
      <VeilleFileSteam />
      {jeu && <Centre key={jeu.appId} />}
    </>
  );
}

/**
 * Quand Steam a redémarré (file vidée), les jeux installés et la bibliothèque
 * sont relus : une désinstallation disparaît, une installation commence.
 */
function VeilleFileSteam() {
  const client = useQueryClient();
  const file = useFileSteam().data;
  const n = file ? file.installations.length + file.desinstallations.length : 0;
  const avant = useRef(n);
  useEffect(() => {
    if (n < avant.current) {
      void client.invalidateQueries({ queryKey: ["installes"] });
      void client.invalidateQueries({ queryKey: ["bibliotheque"] });
    }
    avant.current = n;
  }, [n, client]);
  return null;
}

function Centre() {
  const s = useInstallation();
  const jeu = s.jeu!;
  const client = useQueryClient();
  const palette = usePalette(jeu.hero, jeu.nom);
  const [sortie, setSortie] = useState(false);
  const minuterie = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(minuterie.current), []);

  const enChoix = s.phase === "choix";
  const installes = useJeuxInstalles(!enChoix);
  const stats = useStatsSysteme(!enChoix);
  const pc = useDebitsPc(stats.data);

  const sur = installes.data?.find((j) => j.appId === jeu.appId) ?? null;
  const installation: Installation | null = sur
    ? { etat: sur.etat, taille: sur.taille, dossier: sur.dossier, aTelecharger: sur.aTelecharger, telecharge: sur.telecharge }
    : null;
  const enCours = installation?.etat === "telechargement" || installation?.etat === "enPause";
  const pret = s.phase === "suivi" && !!installation && !enCours && installation.etat !== "autre";

  // Fin du téléchargement : la fenêtre revient d'elle-même, la bibliothèque se met à jour.
  const etaitEnCours = useRef(false);
  useEffect(() => {
    if (enCours) etaitEnCours.current = true;
    if (pret && etaitEnCours.current) {
      etaitEnCours.current = false;
      s.agrandir();
      void client.invalidateQueries({ queryKey: ["bibliotheque"] });
    }
  }, [enCours, pret, s, client]);

  const fermerAnime = useCallback(
    (action: () => void) => {
      setSortie(true);
      window.clearTimeout(minuterie.current);
      minuterie.current = window.setTimeout(() => {
        setSortie(false);
        action();
      }, DUREE_SORTIE);
    },
    [],
  );

  // Échap : ferme le choix, réduit le suivi, ferme l'écran « prêt ».
  useEffect(() => {
    if (s.reduite) return;
    const touche = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || s.phase === "lancement") return;
      if (enChoix || pret) fermerAnime(s.fermer);
      else s.reduire();
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [s, enChoix, pret, fermerAnime]);

  const style = { "--inst-teinte": palette[0] } as CSSProperties;

  if (s.reduite && !pret) {
    return createPortal(<Pastille installation={installation} pc={pc.reseau} />, document.body);
  }

  return createPortal(
    <div className="inst" style={style}>
      <DefsLianes />
      <div
        className={`inst__voile ${sortie ? "is-sortie" : "is-entree"}`}
        onClick={() => {
          if (s.phase === "lancement") return;
          if (enChoix || pret) fermerAnime(s.fermer);
          else s.reduire();
        }}
        aria-hidden="true"
      >
        {POUSSIERES.map((p, i) => (
          <span
            key={i}
            className="inst__poussiere"
            style={{ left: p.left, bottom: p.bottom, width: p.size, height: p.size, animationDuration: p.duree, animationDelay: p.delai }}
          />
        ))}
      </div>
      {enChoix ? (
        <FenetreChoix sortie={sortie} onFermer={() => fermerAnime(s.fermer)} onLancer={(lecteur, taille) => fermerAnime(() => s.lance(lecteur, taille))} />
      ) : (
        <FenetreSuivi
          sortie={sortie}
          installation={installation}
          pret={pret}
          pc={pc}
          stats={stats.data}
          onReduire={s.reduire}
          onFermer={() => fermerAnime(s.fermer)}
        />
      )}
    </div>,
    document.body,
  );
}

// ——— 1. Choix du disque ———

function FenetreChoix({
  sortie,
  onFermer,
  onLancer,
}: {
  sortie: boolean;
  onFermer: () => void;
  onLancer: (lecteur: string, tailleEstimee: number | null) => void;
}) {
  const jeu = useInstallation((s) => s.jeu)!;
  const demarre = useInstallation((s) => s.demarre);
  const erreur = useInstallation((s) => s.erreur);
  const client = useQueryClient();
  const options = useQuery({
    queryKey: ["options-installation", jeu.appId],
    queryFn: () => api.optionsInstallation(jeu.appId, jeu.nom),
    staleTime: 0,
  });
  const o = options.data;
  const besoin = (o?.tailleEstimee ?? 0) * MARGE;
  const [choix, setChoix] = useState<string | null>(null);
  const [bureau, setBureau] = useState(true);
  const [menu, setMenu] = useState(true);

  // Par défaut : le disque qui a le plus de place parmi ceux qui suffisent.
  useEffect(() => {
    if (!o || choix) return;
    const ok = o.disques.filter((d) => d.libre >= besoin).sort((a, b) => b.libre - a.libre);
    setChoix((ok[0] ?? o.disques[0])?.bibliotheque ?? null);
  }, [o, choix, besoin]);

  const disque = useMemo(() => o?.disques.find((d) => d.bibliotheque === choix), [o, choix]);
  const bloque = !o || !disque || disque.libre < besoin || o.dejaInstalle;
  const nomEnCours = useNomJeu(o?.jeuEnCours);

  const installer = () => {
    if (!o || !disque || bloque) return;
    const nom = o.nom;
    // La fenêtre passe tout de suite au suivi (« Steam démarre… ») pendant que le Rust travaille.
    onLancer(disque.lecteur, o.tailleEstimee);
    api
      .installerJeu({ appId: jeu.appId, nom, bibliotheque: disque.bibliotheque, raccourciBureau: bureau, raccourciMenu: menu })
      .then((f) => {
        client.setQueryData(["file-steam"], f);
        demarre();
      })
      .catch((e) => {
        // Échec : retour au choix, avec le message dans la fenêtre.
        useInstallation.getState().ouvrirChoix(jeu, estErreurApp(e) ? e.message : String(e));
      });
  };

  return (
    <div className={`inst__bloc ${sortie ? "is-sortie" : "is-entree"}`} style={{ width: 560 }}>
      <LianeHautChoix />
      <LianeCote />
      <span className="inst__petale" style={{ left: 180, top: -6, animationDuration: "9s", animationDelay: "1.5s" }} />
      <span className="inst__petale" style={{ left: 300, top: 2, animationDuration: "11s", animationDelay: "4.5s" }} />
      <span className="inst__petale" style={{ right: -8, top: 150, animationDuration: "10s", animationDelay: "3s" }} />
      <span className="inst__petale" style={{ left: 90, top: -10, animationDuration: "12.5s", animationDelay: "7s" }} />

      <div role="dialog" aria-modal="true" aria-labelledby="inst-titre" className="inst__panneau">
        <Grain />
        <div className="inst__liseré" aria-hidden="true" />
        <div className="inst__entete">
          <div className="inst__jaquette" style={jeu.jaquette ? { backgroundImage: `url("${jeu.jaquette}")` } : undefined} />
          <div className="inst__titres">
            <span className="inst__statut">
              <span className="inst__point" />
              Installer
            </span>
            <h2 id="inst-titre" className="inst__nom">
              {o?.nom ?? jeu.nom}
            </h2>
            <div className="inst__puces">
              <span>{o ? (o.tailleEstimee ? `environ ${taille(o.tailleEstimee)}` : "taille inconnue") : "…"}</span>
              <span>Raccourcis inclus</span>
            </div>
          </div>
          <button type="button" className="inst__fermer" aria-label="Fermer" onClick={onFermer}>
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <span className="inst__etiquette">Où l’installer</span>
        <div className="inst__disques" role="radiogroup" aria-label="Disque d'installation">
          {!o && !options.isError && <p className="inst__note">Lecture des disques…</p>}
          {options.isError && <p className="message">{estErreurApp(options.error) ? options.error.message : "Disques illisibles."}</p>}
          {o?.disques.map((d) => {
            const actif = d.bibliotheque === choix;
            const suffisant = d.libre >= besoin;
            const occupe = d.total > 0 ? (1 - d.libre / d.total) * 100 : 0;
            const ajout = actif && d.total > 0 ? Math.min(100 - occupe, (besoin / MARGE / d.total) * 100) : 0;
            return (
              <button
                key={d.bibliotheque}
                type="button"
                role="radio"
                aria-checked={actif}
                disabled={!suffisant}
                className={`inst-disque${actif ? " is-actif" : ""}`}
                onClick={() => setChoix(d.bibliotheque)}
              >
                <EngrenageDisque actif={actif} />
                <span className="inst-disque__corps">
                  <span className="inst-disque__ligne">
                    <strong>{nomDisque(d)}</strong>
                    <span style={{ fontWeight: 600 }}>{taille(d.libre)} libres</span>
                  </span>
                  <span className="inst-disque__barre" aria-hidden="true">
                    <span className="inst-disque__occupe" style={{ width: `${occupe}%` }} />
                    <span className="inst-disque__jeu" style={{ left: `${occupe}%`, width: `${Math.max(ajout, actif ? 1 : 0)}%` }} />
                  </span>
                  <span className="inst-disque__ligne inst-disque__ligne--petite">
                    <span>{d.bibliotheque}</span>
                    {!suffisant ? (
                      <span className="inst-disque__alerte">Espace insuffisant</span>
                    ) : actif && o.tailleEstimee ? (
                      <span>après installation : {taille(Math.max(0, d.libre - o.tailleEstimee))}</span>
                    ) : null}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="inst__options">
          <Case libelle="Raccourci sur le Bureau" coche={bureau} onChange={setBureau} />
          <Case libelle="Menu Démarrer" coche={menu} onChange={setMenu} />
        </div>

        {o?.jeuEnCours && (
          <p className="inst__info">
            <span className="inst__point" />
            {nomEnCours ?? "Un jeu"} est lancé : le téléchargement partira tout seul dès que tu le quittes.
          </p>
        )}
        {o?.dejaInstalle && <p className="message">Ce jeu est déjà installé ou en cours d’installation.</p>}
        {erreur && <p className="message">{erreur}</p>}

        <p className="inst__note">
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flex: "0 0 auto", marginTop: 2 }}>
            <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
          </svg>
          Steam s’en charge discrètement en arrière-plan, puis télécharge seul. Tu suis tout ici.
        </p>

        <div className="inst__boutons">
          <button type="button" className="inst-btn" onClick={onFermer}>
            Annuler
          </button>
          <button type="button" className="inst-btn inst-btn--clair" onClick={installer} disabled={bloque}>
            {!bloque && <span className="inst-btn__reflet" aria-hidden="true" />}
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
            </svg>
            <span>Installer sur {disque?.lecteur ?? "…"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Case({ libelle, coche, onChange }: { libelle: string; coche: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={coche} className={`inst-case${coche ? " is-coche" : ""}`} onClick={() => onChange(!coche)}>
      <span className="inst-case__boite" aria-hidden="true">
        {coche && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2">
            <path d="M5 12l5 5 9-10" />
          </svg>
        )}
      </span>
      {libelle}
    </button>
  );
}

function Grain() {
  return (
    <svg aria-hidden="true" className="inst__grain">
      <filter id="inst-grain">
        <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves={3} stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#inst-grain)" />
    </svg>
  );
}

// ——— 2. Suivi du téléchargement / prêt à jouer ———

function useAvancement(installation: Installation | null, stats: Parameters<typeof useEstimationReseau>[2], reseau: number | null) {
  const jeu = useInstallation((s) => s.jeu)!;
  const tailleEstimee = useInstallation((s) => s.tailleEstimee);
  const enCours = installation?.etat === "telechargement" || installation?.etat === "enPause";
  const total = installation && installation.aTelecharger > 0 ? installation.aTelecharger : tailleEstimee ?? 0;
  const brut = installation && installation.aTelecharger > 0 ? Math.min(1, installation.telecharge / installation.aTelecharger) : 0;
  const estimation = useEstimationReseau(jeu.appId, installation, stats);
  const fraction = estimation != null ? Math.max(brut, estimation) : brut;
  const vitesse = useVitesse(jeu.appId, enCours && installation.etat === "telechargement" ? installation.telecharge : null);
  const debitUtile = vitesse && vitesse > 0 ? vitesse : reseau;
  const reste = enCours && debitUtile && debitUtile > 0 && total > 0 ? (total * (1 - fraction)) / debitUtile : Infinity;
  return { total, fraction, estimation, vitesse, reste, connu: !!installation && installation.aTelecharger > 0 };
}

function FenetreSuivi({
  sortie,
  installation,
  pret,
  pc,
  stats,
  onReduire,
  onFermer,
}: {
  sortie: boolean;
  installation: Installation | null;
  pret: boolean;
  pc: { reseau: number | null; ecriture: number | null };
  stats: Parameters<typeof useEstimationReseau>[2];
  onReduire: () => void;
  onFermer: () => void;
}) {
  const jeu = useInstallation((s) => s.jeu)!;
  const phase = useInstallation((s) => s.phase);
  const lecteurChoisi = useInstallation((s) => s.lecteur);
  const a = useAvancement(installation, stats, pc.reseau);
  const file = useFileSteam().data;
  const client = useQueryClient();
  const enFile = !pret && !!file?.installations.includes(jeu.appId);
  const attendJeu = enFile && file?.phase === "attenteJeu";
  const nomEnCours = useNomJeu(file?.jeuEnCours);
  const [annulation, setAnnulation] = useState<string | null>(null);
  const annuler = () => {
    api
      .annulerFileSteam(jeu.appId)
      .then((f) => {
        client.setQueryData(["file-steam"], f);
        void client.invalidateQueries({ queryKey: ["installes"] });
        onFermer();
      })
      .catch((e) => setAnnulation(estErreurApp(e) ? e.message : String(e)));
  };
  const enPause = installation?.etat === "enPause";
  const lecteur = lecteurChoisi ?? (installation?.dossier ? installation.dossier.slice(0, 2).toUpperCase() : null);
  const libre = lecteur ? stats?.disques.find((d) => d.lecteur.toUpperCase() === lecteur.toUpperCase())?.libre : undefined;
  const fraction = pret ? 1 : a.fraction;
  const inconnu = !pret && !a.connu;

  const statut = pret
    ? "Prêt à jouer"
    : attendJeu
      ? "En attente"
      : phase === "lancement" || enFile
        ? "Steam démarre"
      : enPause
        ? `En pause${lecteur ? ` · ${lecteur}` : ""}`
        : a.connu
          ? `Téléchargement${lecteur ? ` · ${lecteur}` : ""}`
          : "Préparation";

  const jouer = () => {
    void api.steamLien({ type: "jouer", appId: jeu.appId });
    onFermer();
  };

  return (
    <div className={`inst__bloc ${sortie ? "is-sortie" : "is-entree"}`} style={{ width: 620 }}>
      <LianeHautSuivi fleurs={pret} />
      <span className="inst__petale" style={{ left: 150, top: -4, animationDuration: "10s", animationDelay: "2s" }} />
      <span className="inst__petale" style={{ left: 250, top: 0, animationDuration: "12s", animationDelay: "6s" }} />

      <div role="dialog" aria-modal="true" aria-labelledby="inst-suivi" className="inst__panneau" style={{ gap: 22 }}>
        <Grain />
        <div className="inst__liseré" aria-hidden="true" />
        <div className="inst__entete">
          <div className="inst__jaquette inst__jaquette--petite" style={jeu.jaquette ? { backgroundImage: `url("${jeu.jaquette}")` } : undefined} />
          <div className="inst__titres" style={{ gap: 7 }}>
            <span className="inst__statut" role="status">
              <span className={`inst__point${enPause || attendJeu ? " is-gris" : ""}`} />
              {statut}
            </span>
            <h2 id="inst-suivi" className="inst__nom" style={{ fontSize: 28 }}>
              {jeu.nom}
            </h2>
          </div>
          <span className="inst__pct" title={a.estimation != null ? "Estimation d'après la carte réseau" : undefined}>
            {inconnu ? "…" : `${a.estimation != null && !pret ? "≈" : ""}${Math.floor(fraction * 100)} %`}
          </span>
        </div>

        <BarreLiane fraction={fraction} inconnu={inconnu} arret={enPause || pret || attendJeu} />

        <div className="inst__resume">
          <span>
            {attendJeu ? (
              <>
                Partira dès que tu quittes <strong>{nomEnCours ?? "ton jeu"}</strong>
              </>
            ) : a.total > 0 ? (
              <>
                <strong>{taille(fraction * a.total)}</strong> sur {taille(a.total)}
              </>
            ) : phase === "lancement" || enFile ? (
              "Steam redémarre en arrière-plan…"
            ) : (
              "Steam prépare le téléchargement…"
            )}
          </span>
          <span>
            {pret
              ? `Installé${lecteur ? ` sur ${lecteur}` : ""}`
              : attendJeu
                ? "Steam redémarrera caché"
                : enPause
                  ? "En pause dans Steam"
                  : dureeRestante(a.reste)}
          </span>
        </div>

        <div className="inst__stats">
          <Stat valeur={pc.reseau != null && !pret ? debit(pc.reseau) : "—"} libelle="réseau" />
          <Stat valeur={a.vitesse != null && !pret ? debit(a.vitesse) : "—"} libelle="Steam" />
          <Stat valeur={pc.ecriture != null && !pret ? debit(pc.ecriture) : "—"} libelle="écriture disque" />
          <Stat valeur={libre != null ? taille(libre) : "—"} libelle={`libres${lecteur ? ` sur ${lecteur}` : ""}`} />
        </div>

        {annulation && <p className="message">{annulation}</p>}

        <div className="inst__boutons inst__boutons--ecartes">
          {attendJeu ? (
            <>
              <button type="button" className="inst-btn" onClick={annuler}>
                Annuler l’installation
              </button>
              <button type="button" className="inst-btn inst-btn--clair" onClick={onReduire}>
                Continuer en arrière-plan
              </button>
            </>
          ) : pret ? (
            <>
              <button type="button" className="inst-btn" onClick={onFermer}>
                Fermer
              </button>
              <button type="button" className="inst-btn inst-btn--jouer" onClick={jouer}>
                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 4l14 8-14 8z" />
                </svg>
                Jouer
              </button>
            </>
          ) : (
            <>
              <span className="inst__note" style={{ fontSize: 12 }}>
                {a.connu ? "Lu sur le disque, toutes les 2 s" : "En attente des chiffres de Steam"}
              </span>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" className="inst-btn" onClick={() => void api.steamLien({ type: "telechargements" })}>
                  Ouvrir dans Steam
                </button>
                <button type="button" className="inst-btn inst-btn--clair" onClick={onReduire}>
                  Continuer en arrière-plan
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ valeur, libelle }: { valeur: string; libelle: string }) {
  return (
    <div className="inst__stat">
      <strong>{valeur}</strong>
      <span>{libelle}</span>
    </div>
  );
}

// ——— 3. Pastille réduite ———

function Pastille({ installation, pc }: { installation: Installation | null; pc: number | null }) {
  const jeu = useInstallation((s) => s.jeu)!;
  const agrandir = useInstallation((s) => s.agrandir);
  const stats = useStatsSysteme(true);
  const a = useAvancement(installation, stats.data, pc);
  const file = useFileSteam().data;
  const attendJeu = !!file?.installations.includes(jeu.appId) && file.phase === "attenteJeu";
  const nomEnCours = useNomJeu(file?.jeuEnCours);
  const pct = a.connu ? `${a.estimation != null ? "≈" : ""}${Math.floor(a.fraction * 100)} %` : "…";
  return (
    <button type="button" className="inst-pastille" onClick={agrandir} aria-label={`Téléchargement de ${jeu.nom}, ${pct}. Ouvrir`}>
      <DefsLianes />
      <AnneauProgression fraction={a.fraction} />
      <span className="inst-pastille__texte">
        <strong>
          {jeu.nom} · {pct}
        </strong>
        <span>
          {attendJeu
            ? `après ${nomEnCours ?? "ton jeu"}`
            : installation?.etat === "enPause"
              ? "En pause"
              : dureeRestante(a.reste) || "Préparation…"}
        </span>
      </span>
    </button>
  );
}
