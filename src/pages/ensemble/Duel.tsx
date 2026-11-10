import { useMemo, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  useBibliotheque,
  useBilanTrophees,
  useImages,
  useJoueurMoi,
  useNiveauBadges,
  useProfilJoueur,
  useRecemmentJoues,
} from "../../api/requetes";
import { useSession } from "../../app/session";
import { estErreurApp, type BilanTrophees, type JeuPossede } from "../../api/types";
import { BadgeRang } from "../../components/BadgeRang";
import { LuneCeleste } from "../../components/LuneCeleste";
import { Smoke } from "../../components/Smoke";
import { entier, heures } from "../../lib/format";
import { imagesDe, replierJaquette } from "../../lib/images";
import { Avatar } from "./JeuxEnCommun";
import { calculerPoints, niveauDepuisPoints, type NiveauLune } from "../../lib/niveauResteam";
import { NOMS_RANGS, rangDepuisMinutes } from "../../lib/rangs";
import "../pages.css";
import "./duel.css";

/** Ce qu'on sait d'un joueur pour le duel (`null` : privé ou pas encore chargé). */
type Camp = {
  pseudo: string;
  steamId: string;
  avatar: string;
  jeux: JeuPossede[] | null;
  recentes: number | null;
  trophees: BilanTrophees | null;
  tropheesPrives: boolean;
  niveauSteam: number | null;
  badges: number | null;
  lune: NiveauLune | null;
};

type Epreuve = {
  id: string;
  titre: string;
  moi: number | null;
  lui: number | null;
  /** Texte affiché (par défaut, le nombre). */
  format?: (v: number) => ReactNode;
};

function camp(pseudo: string, steamId: string, avatar: string, jeux: JeuPossede[] | null, recentes: number | null, trophees: BilanTrophees | null, tropheesPrives: boolean, niveauSteam: number | null, badges: number | null, jeuxCharges: boolean): Camp {
  const lune = jeux && jeuxCharges && (trophees || tropheesPrives) ? niveauDepuisPoints(calculerPoints(jeux.map((j) => j.minutesTotal), trophees?.total ?? 0, trophees?.complets.length ?? 0).total) : null;
  return { pseudo, steamId, avatar, jeux, recentes, trophees, tropheesPrives, niveauSteam, badges, lune };
}

const rangMax = (jeux: JeuPossede[]) => jeux.reduce((m, j) => Math.max(m, rangDepuisMinutes(j.minutesTotal).niveau), 0);
const totalMinutes = (jeux: JeuPossede[]) => jeux.reduce((s, j) => s + j.minutesTotal, 0);

/**
 * Duel de profils (idée de Tom) : toi et un ami côte à côte. Dix épreuves (heures,
 * trophées, lune, rangs…), un score, et vos jeux en commun avec les heures de chacun.
 */
export function Duel() {
  const { steamId: brut } = useParams();
  const navigate = useNavigate();
  const ami = brut && /^\d{17}$/.test(brut) ? brut : null;
  const moiId = useSession((s) => s.steamId);

  const joueur = useJoueurMoi().data?.donnees;
  const biblio = useBibliotheque();
  const recents = useRecemmentJoues();
  const niveau = useNiveauBadges();
  const bilanMoi = useBilanTrophees(null);
  const profil = useProfilJoueur(ami);
  const bilanLui = useBilanTrophees(ami);
  const p = profil.data?.donnees;

  const mesJeux = useMemo(() => (biblio.data?.donnees.jeux ?? []).filter((j) => !j.cache), [biblio.data]);
  const prive = (e: unknown) => !!e && estErreurApp(e) && e.code === "prive";

  const moi = camp(
    "Toi",
    moiId ?? "",
    joueur?.avatar ?? "",
    biblio.data ? mesJeux : null,
    recents.data ? recents.data.donnees.reduce((s, j) => s + j.minutesDeuxSemaines, 0) : null,
    bilanMoi.data?.donnees ?? null,
    prive(bilanMoi.error) || bilanMoi.isError,
    niveau.data?.donnees.niveau ?? null,
    niveau.data?.donnees.badges.length ?? null,
    !!biblio.data,
  );
  const lui = camp(
    p?.joueur.pseudo ?? "…",
    ami ?? "",
    p?.joueur.avatar ?? "",
    p?.jeux ?? null,
    p?.recents ? p.recents.reduce((s, j) => s + j.minutesDeuxSemaines, 0) : null,
    bilanLui.data?.donnees ?? null,
    prive(bilanLui.error) || bilanLui.isError,
    p?.niveau?.niveau ?? null,
    p?.niveau ? p.niveau.badges.length : null,
    !!p,
  );

  const epreuves: Epreuve[] = [
    { id: "heures", titre: "Heures de jeu", moi: moi.jeux && totalMinutes(moi.jeux), lui: lui.jeux && totalMinutes(lui.jeux), format: (v) => heures(v) },
    { id: "jeux", titre: "Jeux possédés", moi: moi.jeux?.length ?? null, lui: lui.jeux?.length ?? null },
    { id: "lances", titre: "Jeux lancés", moi: moi.jeux?.filter((j) => j.minutesTotal > 0).length ?? null, lui: lui.jeux?.filter((j) => j.minutesTotal > 0).length ?? null },
    { id: "recent", titre: "Ces 2 semaines", moi: moi.recentes, lui: lui.recentes, format: (v) => heures(v) },
    { id: "trophees", titre: "Trophées", moi: moi.trophees?.total ?? null, lui: lui.trophees?.total ?? null },
    { id: "complets", titre: "Jeux à 100 %", moi: moi.trophees?.complets.length ?? null, lui: lui.trophees?.complets.length ?? null },
    { id: "lune", titre: "Niveau de lune", moi: moi.lune?.niveau ?? null, lui: lui.lune?.niveau ?? null },
    {
      id: "rang",
      titre: "Meilleur rang",
      moi: moi.jeux && rangMax(moi.jeux),
      lui: lui.jeux && rangMax(lui.jeux),
      format: (v) => (
        <span className="duel__rang">
          <BadgeRang niveau={v} taille={26} />
          {v > 0 ? NOMS_RANGS[v - 1] : "Novice"}
        </span>
      ),
    },
    { id: "steam", titre: "Niveau Steam", moi: moi.niveauSteam, lui: lui.niveauSteam },
    { id: "badges", titre: "Badges", moi: moi.badges, lui: lui.badges },
  ];
  const jouees = epreuves.filter((e) => e.moi != null && e.lui != null && e.moi !== e.lui);
  const scoreMoi = jouees.filter((e) => (e.moi as number) > (e.lui as number)).length;
  const scoreLui = jouees.length - scoreMoi;
  const pret = !!p && !!biblio.data;

  // Jeux en commun : d'abord ceux où le moins joueur des deux a le plus d'heures.
  const communs = useMemo(() => {
    if (!lui.jeux) return [];
    const siens = new Map(lui.jeux.map((j) => [j.appId, j]));
    return mesJeux
      .filter((j) => siens.has(j.appId))
      .map((j) => ({ jeu: j, moi: j.minutesTotal, lui: siens.get(j.appId)?.minutesTotal ?? 0 }))
      .sort((a, b) => Math.min(b.moi, b.lui) - Math.min(a.moi, a.lui) || b.moi + b.lui - (a.moi + a.lui));
  }, [mesJeux, lui.jeux]);
  const images = useImages(communs.slice(0, 8).map((c) => c.jeu.appId));

  if (!ami) {
    return (
      <div className="page">
        <div className="page__content">
          <p className="message">Ce joueur est introuvable.</p>
        </div>
      </div>
    );
  }

  const verdict = !pret
    ? "Les deux profils se chargent…"
    : scoreMoi === scoreLui
      ? `Égalité, ${scoreMoi} partout`
      : scoreMoi > scoreLui
        ? `Tu mènes ${scoreMoi} à ${scoreLui}`
        : `${lui.pseudo} mène ${scoreLui} à ${scoreMoi}`;

  return (
    <div className="page">
      <Smoke variant="top" />
      <div className="page__content duel">
        <header className="duel__entete">
          <button type="button" className="fiche__retour" onClick={() => navigate(-1)}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 6l-6 6 6 6" />
            </svg>
            Retour
          </button>
          <h1 className="page__title">Duel de profils</h1>
        </header>

        {profil.isError && <p className="message">{estErreurApp(profil.error) ? profil.error.message : "Le profil n’a pas pu être lu."}</p>}

        <section className="duel__arene" aria-label="Les deux joueurs">
          <Combattant c={moi} cote="gauche" />
          <div className="duel__centre">
            <span className="duel__vs">VS</span>
            <strong className="duel__score" aria-live="polite">
              <span className={scoreMoi > scoreLui ? "is-gagne" : ""}>{pret ? scoreMoi : "–"}</span>
              <i aria-hidden="true" />
              <span className={scoreLui > scoreMoi ? "is-gagne" : ""}>{pret ? scoreLui : "–"}</span>
            </strong>
            <span className="duel__verdict">{verdict}</span>
          </div>
          <Combattant c={lui} cote="droite" onOuvrir={() => navigate(`/profil/${ami}`)} />
        </section>

        <section className="duel__epreuves" aria-label="Épreuves">
          {epreuves.map((e, i) => (
            <LigneEpreuve key={e.id} e={e} index={i} />
          ))}
        </section>
        {(lui.jeux === null && p) || lui.tropheesPrives ? (
          <p className="duel__note">Certaines données de {lui.pseudo} sont privées sur Steam : ces épreuves ne comptent pas.</p>
        ) : null}

        <section className="duel__communs" aria-labelledby="duel-communs">
          <div className="duel__communs-tete">
            <h2 id="duel-communs" className="secondaire__titre">
              Vos jeux en commun <span className="secondaire__compte">{lui.jeux ? communs.length : ""}</span>
            </h2>
            {communs.length > 0 && (
              <button type="button" className="btn btn--secondaire btn--petit" onClick={() => navigate(`/ensemble?amis=${ami}`)}>
                Tous les jeux en commun
              </button>
            )}
          </div>
          {p && !lui.jeux && <p className="journal__vide">Sa bibliothèque est privée : Steam ne montre pas ses jeux.</p>}
          {lui.jeux && communs.length === 0 && <p className="journal__vide">Aucun jeu en commun pour l’instant.</p>}
          <ul className="duel__jeux">
            {communs.slice(0, 8).map((c, i) => {
              const max = Math.max(1, c.moi, c.lui);
              return (
                <li key={c.jeu.appId} style={{ animationDelay: `${i * 40}ms` }}>
                  <button type="button" onClick={() => navigate(`/jeu/${c.jeu.appId}`)}>
                    <em className={c.moi >= c.lui && c.moi > 0 ? "is-gagne" : ""}>{c.moi ? heures(c.moi) : "—"}</em>
                    <span className="duel__barre is-gauche">
                      <span style={{ transform: `scaleX(${c.moi / max})` }} />
                    </span>
                    <span className="duel__jeu">
                      <img src={imagesDe(c.jeu.appId, images.data).jaquettePetite ?? undefined} alt="" loading="lazy" draggable={false} onError={(e) => replierJaquette(e.currentTarget)} />
                      <strong>{c.jeu.nom}</strong>
                    </span>
                    <span className="duel__barre is-droite">
                      <span style={{ transform: `scaleX(${c.lui / max})` }} />
                    </span>
                    <em className={c.lui >= c.moi && c.lui > 0 ? "is-gagne" : ""}>{c.lui ? heures(c.lui) : "—"}</em>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Combattant({ c, cote, onOuvrir }: { c: Camp; cote: "gauche" | "droite"; onOuvrir?: () => void }) {
  const contenu = (
    <>
      <Avatar steamId={c.steamId} avatar={c.avatar} pseudo={c.pseudo} className="duel__avatar" />
      <span className="duel__identite">
        <strong>{c.pseudo}</strong>
        <span>{c.lune ? `Niveau de lune ${c.lune.niveau}` : c.jeux === null && c.pseudo !== "…" && cote === "droite" ? "Profil privé" : "…"}</span>
      </span>
      <span className="duel__lune">{c.lune && <LuneCeleste niveau={c.lune.niveau} fraction={c.lune.fraction} taille={84} />}</span>
    </>
  );
  return onOuvrir ? (
    <button type="button" className={`duel__camp is-${cote}`} onClick={onOuvrir} title={`Voir le profil de ${c.pseudo}`}>
      {contenu}
    </button>
  ) : (
    <div className={`duel__camp is-${cote}`}>{contenu}</div>
  );
}

function LigneEpreuve({ e, index }: { e: Epreuve; index: number }) {
  const connu = e.moi != null && e.lui != null;
  const max = Math.max(1, e.moi ?? 0, e.lui ?? 0);
  const gagnant = connu && e.moi !== e.lui ? ((e.moi as number) > (e.lui as number) ? "moi" : "lui") : null;
  const valeur = (v: number | null) => (v == null ? "—" : e.format ? e.format(v) : entier(v));
  return (
    <div className="duel__epreuve" style={{ animationDelay: `${index * 45}ms` }}>
      <span className={`duel__valeur is-gauche${gagnant === "moi" ? " is-gagne" : ""}`}>
        {gagnant === "moi" && <i className="duel__croissant" aria-label="gagné" />}
        {valeur(e.moi)}
      </span>
      <span className="duel__barre is-gauche">
        <span style={{ transform: `scaleX(${(e.moi ?? 0) / max})` }} />
      </span>
      <span className="duel__titre">{e.titre}</span>
      <span className="duel__barre is-droite">
        <span style={{ transform: `scaleX(${(e.lui ?? 0) / max})` }} />
      </span>
      <span className={`duel__valeur is-droite${gagnant === "lui" ? " is-gagne" : ""}`}>
        {valeur(e.lui)}
        {gagnant === "lui" && <i className="duel__croissant" aria-label="gagné" />}
      </span>
    </div>
  );
}
