import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api/commandes";
import { estErreurApp, type Disque, type OptionsInstallation } from "../../api/types";
import { taille } from "../../lib/format";

type Props = {
  appId: number;
  nom: string;
  jaquette: string | null;
  onFermer: () => void;
  /** Installation lancée : Steam redémarre en arrière-plan et télécharge. */
  onLancee: () => void;
};

/** Marge de sécurité sur l'estimation (la config minimale arrondit souvent). */
const MARGE = 1.1;

function libelleDisque(d: Disque): string {
  return d.nom ? `${d.nom} (${d.lecteur})` : `Disque local (${d.lecteur})`;
}

/**
 * Fenêtre d'installation de ResTeaM (remplace celle de Steam) : choix du disque
 * avec l'espace libre réel, raccourcis, puis installation en arrière-plan.
 */
export function FenetreInstallation({ appId, nom, jaquette, onFermer, onLancee }: Props) {
  const [options, setOptions] = useState<OptionsInstallation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [choix, setChoix] = useState<string | null>(null);
  const [bureau, setBureau] = useState(true);
  const [menu, setMenu] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [fermeture, setFermeture] = useState(false);
  const minuterie = useRef<number | undefined>(undefined);

  const fermer = () => {
    if (envoi) return;
    setFermeture(true);
    window.clearTimeout(minuterie.current);
    minuterie.current = window.setTimeout(onFermer, 340);
  };

  useEffect(() => {
    let annule = false;
    api
      .optionsInstallation(appId, nom)
      .then((o) => {
        if (annule) return;
        setOptions(o);
        // Par défaut : le disque qui a le plus de place parmi ceux qui suffisent.
        const besoin = (o.tailleEstimee ?? 0) * MARGE;
        const ok = o.disques.filter((d) => d.libre >= besoin).sort((a, b) => b.libre - a.libre);
        setChoix((ok[0] ?? o.disques[0])?.bibliotheque ?? null);
      })
      .catch((e) => !annule && setErreur(estErreurApp(e) ? e.message : String(e)));
    const touche = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    window.addEventListener("keydown", touche);
    return () => {
      annule = true;
      window.removeEventListener("keydown", touche);
      window.clearTimeout(minuterie.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, nom]);

  const besoin = (options?.tailleEstimee ?? 0) * MARGE;
  const disqueChoisi = useMemo(() => options?.disques.find((d) => d.bibliotheque === choix), [options, choix]);
  const assez = !!disqueChoisi && disqueChoisi.libre >= besoin;
  const bloque = !options || !!options.jeuEnCours || options.dejaInstalle || !assez;

  const installer = async () => {
    if (!options || !choix || bloque) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await api.installerJeu({ appId, nom: options.nom, bibliotheque: choix, raccourciBureau: bureau, raccourciMenu: menu });
      onLancee();
      setEnvoi(false);
      setFermeture(true);
      minuterie.current = window.setTimeout(onFermer, 340);
    } catch (e) {
      setErreur(estErreurApp(e) ? e.message : String(e));
      setEnvoi(false);
    }
  };

  // Rendue sur <body> : au-dessus de la barre de gauche et des boutons de fenêtre.
  return createPortal(
    <div className="installation">
      <div className={`installation__voile ${fermeture ? "bdOut" : "bdIn"}`} onClick={fermer} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="inst-titre" className={`installation__fenetre ${fermeture ? "mOut" : "mIn"}`}>
        <button type="button" className="installation__fermer" aria-label="Fermer" onClick={fermer} disabled={envoi}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <header className="installation__entete">
          <div className="installation__vignette" style={jaquette ? { backgroundImage: `url("${jaquette}")` } : undefined} />
          <div className="installation__titres">
            <span className="kicker">
              <span className="kicker__dot" />
              Installer
            </span>
            <h2 id="inst-titre" className="installation__nom">
              {options?.nom ?? nom}
            </h2>
            <span className="installation__taille">
              {options ? (options.tailleEstimee ? `environ ${taille(options.tailleEstimee)}` : "taille inconnue") : "…"}
            </span>
          </div>
        </header>

        <section className="installation__section" aria-labelledby="inst-disques">
          <h3 id="inst-disques" className="installation__sous-titre">
            Disque d’installation
          </h3>
          {!options && !erreur && <p className="installation__note">Lecture des disques…</p>}
          <div className="installation__disques" role="radiogroup" aria-labelledby="inst-disques">
            {options?.disques.map((d) => {
              const suffisant = d.libre >= besoin;
              const actif = d.bibliotheque === choix;
              const occupe = d.total > 0 ? 1 - d.libre / d.total : 0;
              return (
                <button
                  key={d.bibliotheque}
                  type="button"
                  role="radio"
                  aria-checked={actif}
                  disabled={!suffisant || envoi}
                  className={`disque${actif ? " is-actif" : ""}${suffisant ? "" : " is-plein"}`}
                  onClick={() => setChoix(d.bibliotheque)}
                >
                  <span className="disque__haut">
                    <span className="disque__nom">
                      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect x="3" y="6" width="18" height="12" rx="2.5" />
                        <circle cx="17" cy="12" r="1.2" fill="currentColor" stroke="none" />
                      </svg>
                      {libelleDisque(d)}
                    </span>
                    <span className="disque__libre">{taille(d.libre)} libres</span>
                  </span>
                  <span className="disque__barre" aria-hidden="true">
                    <span style={{ width: `${occupe * 100}%` }} />
                    {besoin > 0 && d.total > 0 && (
                      <span
                        className="disque__besoin"
                        style={{ left: `${occupe * 100}%`, width: `${Math.min(1 - occupe, besoin / d.total) * 100}%` }}
                      />
                    )}
                  </span>
                  <span className="disque__bas">
                    <span>{d.bibliotheque}</span>
                    {!suffisant && <span className="disque__alerte">Espace insuffisant</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="installation__options">
          <label className="case">
            <input type="checkbox" checked={bureau} onChange={(e) => setBureau(e.target.checked)} disabled={envoi} />
            <span className="case__boite" aria-hidden="true" />
            Raccourci sur le Bureau
          </label>
          <label className="case">
            <input type="checkbox" checked={menu} onChange={(e) => setMenu(e.target.checked)} disabled={envoi} />
            <span className="case__boite" aria-hidden="true" />
            Raccourci dans le menu Démarrer
          </label>
        </section>

        {options?.jeuEnCours && (
          <p className="message">Un jeu est lancé : ferme-le d’abord, Steam doit redémarrer quelques secondes.</p>
        )}
        {options?.dejaInstalle && <p className="message">Ce jeu est déjà installé ou en cours d’installation.</p>}
        {erreur && <p className="message">{erreur}</p>}

        <p className="installation__note">
          Steam redémarre en arrière-plan quelques secondes, puis télécharge tout seul. Le suivi s’affiche ici.
        </p>

        <div className="installation__boutons">
          <button type="button" className="btn btn--secondaire btn--petit" onClick={fermer} disabled={envoi}>
            Annuler
          </button>
          <button type="button" className="btn btn--principal btn--petit" onClick={installer} disabled={bloque || envoi}>
            {envoi ? (
              <>
                <span className="attente-anneau attente-anneau--sombre" aria-hidden="true" />
                Redémarrage de Steam…
              </>
            ) : (
              "Installer"
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
