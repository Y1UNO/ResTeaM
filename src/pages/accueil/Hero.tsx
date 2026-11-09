import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/commandes";
import { useFileSteam, usePatchNotes, useSuccesJeu } from "../../api/requetes";
import type { ImagesJeu, JeuBibliotheque } from "../../api/types";
import { Croissant } from "../../components/Croissant";
import { JaugeHeures } from "../../components/JaugeHeures";
import { date, heures, pourcentage } from "../../lib/format";
import { degradeJaquette, replierJaquette } from "../../lib/images";
import { marquerNotesVues, notesVuesLe } from "../../lib/notesVues";
import { Affiche } from "./Ambiance";
import { PanneauPatchNotes } from "./PanneauPatchNotes";
import { useInstallation } from "../../installation/store";
import { FenetreDesinstallation } from "../../installation/Desinstallation";
import { FenetreProprietes } from "../fiche/Proprietes";
import { usePalette } from "../../lib/couleurs";

type EtatJaquette = "repos" | "ouvert" | "fermeture" | "revenu";

const SEMAINE = 7 * 86400;

function kicker(jeu: JeuBibliotheque): string {
  if (!jeu.dernierLancement) return "À découvrir · jamais lancé";
  const ecart = Date.now() / 1000 - jeu.dernierLancement;
  return ecart < SEMAINE ? "Reprendre · joué cette semaine" : `Reprendre · joué le ${date(jeu.dernierLancement)}`;
}

type Props = { jeu: JeuBibliotheque; images: ImagesJeu };

/** Hero de la maquette 01 avec le jeu en vedette. */
export function Hero({ jeu, images }: Props) {
  const navigate = useNavigate();
  const succes = useSuccesJeu(jeu.appId);
  const notes = usePatchNotes(jeu.appId);
  const [etat, setEtat] = useState<EtatJaquette>("repos");
  const [lancement, setLancement] = useState(false);
  const [jaquetteRatee, setJaquetteRatee] = useState(false);
  const installation = useInstallation();
  const suivi = installation.jeu?.appId === jeu.appId;
  const file = useFileSteam().data;
  const aSupprimer = !!file?.desinstallations.includes(jeu.appId);
  const [desinstaller, setDesinstaller] = useState(false);
  const [proprietes, setProprietes] = useState(false);
  const teinte = usePalette(images.hero, jeu.nom)[0];
  const minuterie = useRef<number | undefined>(undefined);

  useEffect(() => {
    setEtat("repos");
    setLancement(false);
    setJaquetteRatee(false);
    setDesinstaller(false);
    setProprietes(false);
    return () => window.clearTimeout(minuterie.current);
  }, [jeu.appId]);

  const n = notes.data?.donnees ?? null;
  const [vuesLe, setVuesLe] = useState(() => notesVuesLe(jeu.appId));
  useEffect(() => setVuesLe(notesVuesLe(jeu.appId)), [jeu.appId]);
  const nouveauPatch = !!n && n.patch && n.date > vuesLe;

  const ouvrir = () => {
    if (!n) return;
    window.clearTimeout(minuterie.current);
    setEtat("ouvert");
    marquerNotesVues(jeu.appId, n.date);
  };
  const fermer = useCallback(() => {
    setEtat((e) => (e === "ouvert" ? "fermeture" : e));
    window.clearTimeout(minuterie.current);
    minuterie.current = window.setTimeout(() => {
      setEtat("revenu");
      setVuesLe(notesVuesLe(jeu.appId));
    }, 800);
  }, [jeu.appId]);

  const inst = jeu.installation;
  const jouable = inst && (inst.etat === "installe" || inst.etat === "miseAJourRequise");
  const enTelechargement = inst && (inst.etat === "telechargement" || inst.etat === "enPause");

  const actionPrincipale = () => {
    const jeuSuivi = { appId: jeu.appId, nom: jeu.nom, jaquette: images.jaquette, hero: images.hero };
    if (enTelechargement || (suivi && installation.phase !== "choix")) {
      installation.ouvrirSuivi(jeuSuivi);
      return;
    }
    if (jouable) {
      void api.steamLien({ type: "jouer", appId: jeu.appId });
      setLancement(true);
      window.clearTimeout(minuterie.current);
      minuterie.current = window.setTimeout(() => setLancement(false), 4000);
      return;
    }
    // Fenêtre d'installation de ResTeaM : choix du disque, puis Steam télécharge en arrière-plan.
    installation.ouvrirChoix(jeuSuivi);
  };

  const s = succes.data?.donnees;
  const titreLong = jeu.nom.length > 22;
  const classeJaquette = { repos: "cvA", ouvert: "cardOut", fermeture: "cardBack", revenu: "" }[etat];
  const afficheImage = images.jaquette && !jaquetteRatee;

  return (
    <section aria-label={kicker(jeu)} className="hero">
      <Affiche url={images.hero} appId={jeu.appId} />
      <div className="hero__voile" aria-hidden="true" />

      <div className="hero__content">
        <div key={`t-${jeu.appId}`} className="hero__text">
          <span className="kicker">
            <span className="kicker__dot" />
            {kicker(jeu)}
          </span>
          <h1 className={`hero__title${titreLong ? " hero__title--long" : ""}`}>{jeu.nom}</h1>

          <div className="hero__chiffres">
            <JaugeHeures minutes={jeu.minutesTotal} />
            {s && s.total > 0 && (
              <div className="carte-verre hero__succes">
                <Croissant valeur={s.debloques / s.total} texte={`${s.debloques}/${s.total}`} />
                <div className="hero__puce-texte">
                  <strong>Succès</strong>
                  <span>{pourcentage(s.debloques / s.total)} débloqués</span>
                </div>
              </div>
            )}
            <div className="carte-verre hero__puce">
              {jeu.minutesDeuxSemaines > 0 ? (
                <>
                  <span className="hero__puce-grand">{heures(jeu.minutesDeuxSemaines)}</span>
                  <span className="hero__puce-petit">ces 2 semaines</span>
                </>
              ) : jeu.dernierLancement ? (
                <>
                  <span className="hero__puce-grand">{date(jeu.dernierLancement)}</span>
                  <span className="hero__puce-petit">dernière partie</span>
                </>
              ) : (
                <>
                  <span className="hero__puce-grand">{inst ? "Installé" : "—"}</span>
                  <span className="hero__puce-petit">{inst ? "prêt à jouer" : "pas encore installé"}</span>
                </>
              )}
            </div>
          </div>

          <div className="hero__boutons">
            <button type="button" className="btn btn--principal" onClick={actionPrincipale}>
              {jouable ? (
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 4l14 8-14 8z" />
                </svg>
              ) : (
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
                </svg>
              )}
              {lancement
                ? "Ouverture dans Steam…"
                : jouable
                  ? "Jouer"
                  : enTelechargement || (suivi && installation.phase !== "choix")
                    ? "Voir le téléchargement"
                    : "Installer"}
            </button>
            <button type="button" className="btn btn--secondaire" onClick={() => navigate(`/jeu/${jeu.appId}`)}>
              Fiche du jeu
            </button>
            <button
              type="button"
              className="btn btn--secondaire hero__corbeille hero__engrenage"
              onClick={() => setProprietes(true)}
              aria-label={`Propriétés de ${jeu.nom}`}
              title="Propriétés"
            >
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
              </svg>
            </button>
            {inst && (
              <button
                type="button"
                className="btn btn--secondaire hero__corbeille"
                onClick={() => setDesinstaller(true)}
                disabled={aSupprimer}
                aria-label={aSupprimer ? `${jeu.nom} : désinstallation prévue` : `Désinstaller ${jeu.nom}`}
                title={aSupprimer ? "Désinstallation prévue" : "Désinstaller"}
              >
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <button
          key={`c-${jeu.appId}`}
          type="button"
          className={`jaquette-hero ${classeJaquette}${n ? "" : " jaquette-hero--muette"}`}
          onClick={ouvrir}
          disabled={!n}
          aria-label={n ? `Voir les patch notes de ${jeu.nom}` : jeu.nom}
          style={{ background: afficheImage ? undefined : degradeJaquette(jeu.nom) }}
        >
          {afficheImage && (
            <img className="jaquette-hero__image" src={images.jaquette!} alt="" draggable={false} onError={(e) => replierJaquette(e.currentTarget) || setJaquetteRatee(true)} />
          )}
          <span className="jaquette-hero__voile" aria-hidden="true" />
          {nouveauPatch && (
            <span className="jaquette-hero__badge">
              <span className="jaquette-hero__point" />
              Nouveau patch
            </span>
          )}
          {!afficheImage && <span className="jaquette-hero__titre">{jeu.nom}</span>}
          {n && <span className="jaquette-hero__indice">Clique pour lire les notes</span>}
        </button>
      </div>

      {proprietes && <FenetreProprietes appId={jeu.appId} nom={jeu.nom} jaquette={images.jaquette} onFermer={() => setProprietes(false)} />}
      {desinstaller && inst && (
        <FenetreDesinstallation
          appId={jeu.appId}
          nom={jeu.nom}
          jaquette={images.jaquette}
          poids={inst.taille}
          dossier={inst.dossier}
          teinte={teinte}
          jeuEnCours={file?.jeuEnCours ?? null}
          onFermer={() => setDesinstaller(false)}
        />
      )}

      {n && (etat === "ouvert" || etat === "fermeture") && (
        <PanneauPatchNotes
          notes={n}
          nomJeu={jeu.nom}
          jaquette={afficheImage ? images.jaquette : null}
          fermeture={etat === "fermeture"}
          onFermer={fermer}
        />
      )}
    </section>
  );
}
