import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/commandes";
import { useBibliotheque, useImages, useJeuxInstalles } from "../api/requetes";
import { estErreurApp, type JeuBibliotheque } from "../api/types";
import { Smoke } from "../components/Smoke";
import { entier, heures } from "../lib/format";
import { degradeJaquette, imagesDe } from "../lib/images";
import { rangDepuisMinutes } from "../lib/rangs";
import { useInstallation } from "../installation/store";
import "./pages.css";
import "./Bibliotheque.css";

type Filtre = "tous" | "installes" | "favoris" | "recents" | `collection:${string}`;
type Tri = "az" | "temps" | "recent";

const DEUX_SEMAINES = 14 * 86400;

/**
 * Bibliothèque complète (maquette 03) : recherche en direct, filtres (dont les
 * collections Steam), tris, jaquettes 3:4 avec rang et favori, Jouer / Installer au survol.
 */
export function Bibliotheque() {
  const biblio = useBibliotheque();
  const installes = useJeuxInstalles();
  const b = biblio.data?.donnees;

  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [tri, setTri] = useState<Tri>("az");
  const ouvrirChoix = useInstallation((s) => s.ouvrirChoix);
  const ouvrirSuivi = useInstallation((s) => s.ouvrirSuivi);

  // État d'installation en direct (le disque fait foi). Un jeu dont l'état n'a pas
  // changé garde le même objet, pour que sa tuile ne se redessine pas à chaque relevé.
  const precedents = useRef(new Map<number, { base: JeuBibliotheque; cle: string; jeu: JeuBibliotheque }>());
  const tous = useMemo(() => {
    const jeux = (b?.jeux ?? []).filter((j) => !j.cache);
    const parId = new Map((installes.data ?? []).map((i) => [i.appId, i]));
    const suivants = new Map<number, { base: JeuBibliotheque; cle: string; jeu: JeuBibliotheque }>();
    const liste = jeux.map((j) => {
      const i = installes.data ? parId.get(j.appId) : undefined;
      const installation = !installes.data
        ? j.installation
        : i
          ? { etat: i.etat, taille: i.taille, dossier: i.dossier, aTelecharger: i.aTelecharger, telecharge: i.telecharge }
          : null;
      const cle = installation
        ? `${installation.etat}|${installation.taille}|${installation.dossier}|${installation.aTelecharger}|${installation.telecharge}`
        : "";
      const p = precedents.current.get(j.appId);
      const jeu = p && p.base === j && p.cle === cle ? p.jeu : { ...j, installation };
      suivants.set(j.appId, { base: j, cle, jeu });
      return jeu;
    });
    precedents.current = suivants;
    return liste;
  }, [b, installes.data]);

  const maintenant = Date.now() / 1000;
  const compte = {
    tous: tous.length,
    installes: tous.filter((j) => j.installation).length,
    favoris: tous.filter((j) => j.favori).length,
    recents: tous.filter((j) => maintenant - j.dernierLancement < DEUX_SEMAINES).length,
  };

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    let liste = tous;
    if (filtre === "installes") liste = liste.filter((j) => j.installation);
    else if (filtre === "favoris") liste = liste.filter((j) => j.favori);
    else if (filtre === "recents") liste = liste.filter((j) => maintenant - j.dernierLancement < DEUX_SEMAINES);
    else if (filtre.startsWith("collection:")) {
      const id = filtre.slice("collection:".length);
      liste = liste.filter((j) => j.collections.includes(id));
    }
    if (q) liste = liste.filter((j) => j.nom.toLowerCase().includes(q));
    const triee = [...liste];
    if (tri === "az") triee.sort((x, y) => x.nom.localeCompare(y.nom, "fr", { sensitivity: "base" }));
    if (tri === "temps") triee.sort((x, y) => y.minutesTotal - x.minutesTotal || x.nom.localeCompare(y.nom));
    if (tri === "recent") triee.sort((x, y) => y.dernierLancement - x.dernierLancement || x.nom.localeCompare(y.nom));
    return triee;
    // `maintenant` change à chaque rendu : on ne le suit pas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tous, filtre, tri, recherche]);

  const images = useImages(tous.map((j) => j.appId));

  // Rappels stables : une tuile ne se redessine que si son jeu ou son image change.
  const imagesRef = useRef(images.data);
  imagesRef.current = images.data;
  const suivre = useCallback(
    (j: JeuBibliotheque, choix: boolean) => {
      const im = imagesDe(j.appId, imagesRef.current);
      const jeu = { appId: j.appId, nom: j.nom, jaquette: im.jaquette, hero: im.hero };
      if (choix) ouvrirChoix(jeu);
      else ouvrirSuivi(jeu);
    },
    [ouvrirChoix, ouvrirSuivi],
  );

  // Un filtre de collection qui n'existe plus revient à « Tous ».
  useEffect(() => {
    if (filtre.startsWith("collection:") && !b?.collections.some((c) => `collection:${c.id}` === filtre)) setFiltre("tous");
  }, [b, filtre]);

  const filtres: { id: Filtre; libelle: string; n: number }[] = [
    { id: "tous", libelle: "Tous", n: compte.tous },
    { id: "installes", libelle: "Installés", n: compte.installes },
    { id: "favoris", libelle: "Favoris", n: compte.favoris },
    { id: "recents", libelle: "Récents", n: compte.recents },
    ...(b?.collections ?? [])
      .filter((c) => !c.dynamique && c.nombre > 0)
      .map((c) => ({ id: `collection:${c.id}` as Filtre, libelle: c.nom || "Collection", n: c.nombre })),
  ];
  const tris: { id: Tri; libelle: string }[] = [
    { id: "az", libelle: "A → Z" },
    { id: "temps", libelle: "Temps de jeu" },
    { id: "recent", libelle: "Dernière partie" },
  ];

  return (
    <div className="page">
      <Smoke variant="top" />
      <div className="page__content biblio">
        <header className="biblio__entete">
          <div className="page__header">
            <h1 className="page__title">Bibliothèque</h1>
            <span className="placeholder-note">
              {b ? `${entier(compte.tous)} jeux · ${entier(compte.installes)} installés` : "Chargement…"}
              {biblio.data?.horsLigne && " · hors ligne"}
            </span>
          </div>
          <label className="biblio__recherche">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <span className="sr-only">Rechercher un jeu</span>
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder={`Rechercher dans tes ${compte.tous} jeux`}
              spellCheck={false}
            />
          </label>
        </header>

        <div className="biblio__barre">
          <div className="biblio__filtres" role="group" aria-label="Filtres">
            {filtres.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filtre === f.id}
                className={`biblio__filtre${filtre === f.id ? " is-actif" : ""}`}
                onClick={() => setFiltre(f.id)}
              >
                {f.libelle}
                <span>{f.n}</span>
              </button>
            ))}
          </div>
          <div className="biblio__tri">
            <span>Trier</span>
            <div className="ruban__onglets" role="group" aria-label="Tri">
              {tris.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={tri === t.id}
                  className={`ruban__onglet${tri === t.id ? " is-actif" : ""}`}
                  onClick={() => setTri(t.id)}
                >
                  {t.libelle}
                </button>
              ))}
            </div>
          </div>
        </div>

        {biblio.isError && <p className="message">{estErreurApp(biblio.error) ? biblio.error.message : String(biblio.error)}</p>}
        {b && visibles.length === 0 && (
          <p className="biblio__vide">
            {recherche ? `Aucun jeu ne correspond à « ${recherche} ».` : "Aucun jeu dans ce filtre."}
          </p>
        )}

        <div key={`${filtre}-${tri}`} className="biblio__grille">
          {visibles.map((j) => (
            <Tuile key={j.appId} jeu={j} jaquette={imagesDe(j.appId, images.data).jaquettePetite ?? null} onAction={suivre} />
          ))}
        </div>
      </div>
    </div>
  );
}

const Tuile = memo(function Tuile({
  jeu,
  jaquette,
  onAction,
}: {
  jeu: JeuBibliotheque;
  jaquette: string | null;
  /** `choix` : ouvrir le choix du disque ; sinon le suivi du téléchargement. */
  onAction: (jeu: JeuBibliotheque, choix: boolean) => void;
}) {
  const navigate = useNavigate();
  const [ratee, setRatee] = useState(false);
  const r = rangDepuisMinutes(jeu.minutesTotal);
  const inst = jeu.installation;
  const enCours = inst?.etat === "telechargement" || inst?.etat === "enPause";
  const jouable = inst && !enCours;
  const image = jaquette && !ratee;

  const action = (e: MouseEvent) => {
    e.stopPropagation();
    if (enCours) onAction(jeu, false);
    else if (jouable) void api.steamLien({ type: "jouer", appId: jeu.appId });
    else onAction(jeu, true);
  };

  return (
    <div className="tuile">
      <div className="tuile__cadre">
      <button
        type="button"
        className="tuile__art"
        data-incline=""
        style={image ? undefined : { background: degradeJaquette(jeu.nom) }}
        onClick={() => navigate(`/jeu/${jeu.appId}`)}
        aria-label={`${jeu.nom} : ouvrir la fiche`}
      >
        {image && <img src={jaquette!} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setRatee(true)} />}
        {jeu.favori && (
          <span className="tuile__favori" title="Favori">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
            </svg>
          </span>
        )}
        {r.niveau > 0 && (
          <span className="tuile__rang" title={`Rang ${r.romain} · ${r.nom}`}>
            {r.romain}
          </span>
        )}
        {!image && <span className="tuile__titre">{jeu.nom}</span>}
        {enCours && inst.aTelecharger > 0 && (
          <span className="tuile__progression" aria-hidden="true">
            <span style={{ width: `${Math.min(100, (inst.telecharge / inst.aTelecharger) * 100)}%` }} />
          </span>
        )}
      </button>
      <button type="button" className={`tuile__action${jouable ? " is-jouer" : ""}`} onClick={action}>
        {enCours ? "En cours" : jouable ? "Jouer" : "Installer"}
      </button>
      </div>
      <div className="tuile__infos">
        <span className="tuile__nom">{jeu.nom}</span>
        <span className="tuile__meta">
          <span>{jeu.minutesTotal > 0 ? heures(jeu.minutesTotal) : "Jamais lancé"}</span>
          <span className="tuile__etat">
            <span className={`tuile__point${inst ? " is-installe" : ""}`} />
            {enCours ? "Téléchargement" : inst ? "Installé" : "Non installé"}
          </span>
        </span>
      </div>
    </div>
  );
});
