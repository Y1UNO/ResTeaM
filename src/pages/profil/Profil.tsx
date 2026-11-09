import { useId, useMemo, useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSession } from "../../app/session";
import { api, dansTauri } from "../../api/commandes";
import {
  useAmis,
  useBibliotheque,
  useImages,
  useJoueurMoi,
  useNiveauBadges,
  useProfilJoueur,
  useRecemmentJoues,
  useSuccesJeu,
  useBilanTrophees,
  useNomJeu,
} from "../../api/requetes";
import { estErreurApp, type Badge, type BilanTrophees, type JeuPossede } from "../../api/types";
import { Croissant } from "../../components/Croissant";
import { LuneProfil } from "./LuneProfil";
import { calculerPoints, niveauDepuisPoints } from "../../lib/niveauResteam";
import { Smoke } from "../../components/Smoke";
import { Compteur, Lucioles } from "../../components/Vivant";
import { BadgeRang } from "../../components/BadgeRang";
import { usePalette } from "../../lib/couleurs";
import { date, entier, heures, statut } from "../../lib/format";
import { degradeJaquette, imagesDe } from "../../lib/images";
import { NOMS_RANGS, PALIERS, ROMAINS, rangDepuisMinutes } from "../../lib/rangs";
import "../pages.css";
import "./profil.css";
import { viaCache } from "../../lib/imageLocale";
import { useObjetsProfil } from "../../api/requetes";
import {
  CadreAvatar,
  EffetProfil,
  FondProfil,
  PanneauPersonnalisation,
  PinceauMagique,
  usePersonnalisation,
  type Personnalisation,
} from "./Personnalisation";

/** Un ami : ses objets Steam, avec les réglages par défaut (ses choix ResTeaM ne sont pas partagés). */
const PERSO_AMI: Personnalisation = { fond: "steam", jeuFond: null, cadre: "steam", avatarAnime: true, effet: "pluie", accent: "#9fd8ff", avatarPerso: null, bannierePerso: null, bannierePersoVideo: false };

const RANGS = [
  { romain: "0", nom: "Novice", seuil: "< 10 h" },
  ...PALIERS.map((p, i) => ({ romain: ROMAINS[i], nom: NOMS_RANGS[i], seuil: p >= 1000 ? `${p / 1000} 000 h` : `${p} h` })),
];
/** Au-delà, on résume (« et 84 autres ») pour garder la ligne lisible. */
const MAX_PUCES = 36;

const pays = (code: string | null) => {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(["fr"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
};

/**
 * Profil (maquette 04) : avatar et croissant de niveau sous une pluie lunaire,
 * 4 chiffres, rangs de temps de jeu cliquables, activité récente et badges.
 */
export function Profil() {
  const { steamId } = useParams();
  const moi = useSession((s) => s.steamId);
  const ami = steamId && steamId !== moi ? steamId : null;
  // Une clé par profil : l'état (rang choisi…) repart de zéro en changeant de joueur.
  return <VueProfil key={ami ?? "moi"} ami={ami} />;
}

function VueProfil({ ami }: { ami: string | null }) {
  const navigate = useNavigate();
  const moiId = useSession((x) => x.steamId);
  const joueur = useJoueurMoi();
  const niveau = useNiveauBadges();
  const biblio = useBibliotheque();
  const recents = useRecemmentJoues();
  const amis = useAmis();
  const profilAmi = useProfilJoueur(ami);
  const bilan = useBilanTrophees(ami);
  const pa = profilAmi.data?.donnees;
  const j = ami ? pa?.joueur : joueur.data?.donnees;
  const n = ami ? (pa?.niveau ?? undefined) : niveau.data?.donnees;
  const jeuxMoi = useMemo(() => (biblio.data?.donnees.jeux ?? []).filter((x) => !x.cache), [biblio.data]);
  const jeux: JeuPossede[] = ami ? (pa?.jeux ?? []) : jeuxMoi;
  const jeuxPrives = !!ami && !!pa && !pa.jeux;
  const r = (ami ? pa?.recents : recents.data?.donnees) ?? [];
  const recentsCharges = ami ? !!pa : !!recents.data;
  const jeuxCharges = ami ? !!pa : !!biblio.data;
  const erreur = ami ? profilAmi.error : joueur.error;
  const chargement = ami ? profilAmi.isLoading : joueur.isLoading;
  const fiche = amis.data?.donnees.amis.find((a) => a.steamId === ami);
  const palette = usePalette(viaCache(j?.avatar) ?? null, j?.pseudo ?? "Profil");
  const objets = useObjetsProfil(ami ?? moiId).data?.donnees;
  const persoMoi = usePersonnalisation((s) => s.p);
  const perso = ami ? PERSO_AMI : persoMoi;
  const [panneau, setPanneau] = useState(false);
  const favoris = useMemo(() => jeuxMoi.filter((x) => x.favori), [jeuxMoi]);
  const imagesFavoris = useImages(panneau || perso.jeuFond ? favoris.map((x) => x.appId) : []);
  const heroFond = perso.fond === "jeu" && perso.jeuFond ? imagesDe(perso.jeuFond, imagesFavoris.data).hero : null;
  const avatarAffiche = (!ami && perso.avatarPerso) || (perso.avatarAnime && objets?.avatarAnime?.image ? objets.avatarAnime.image : j?.avatar);

  const minutesRecentes = r.reduce((s, x) => s + x.minutesDeuxSemaines, 0);
  // Niveau ResTeaM (1 à 30) : trophées, heures, jeux à 100 % et rangs. Trophées privés : 0.
  const b = bilan.data?.donnees;
  const tropheesPrives = !!bilan.error && estErreurApp(bilan.error) && bilan.error.code === "prive";
  const points = useMemo(
    () => calculerPoints(jeux.map((x) => x.minutesTotal), b?.total ?? 0, b?.complets.length ?? 0),
    [jeux, b],
  );
  const luneCalculee = jeuxCharges && (b || bilan.isError) ? niveauDepuisPoints(points.total) : null;
  // Aperçu navigateur seulement : `?lune=N` montre la lune d'un niveau donné.
  const luneForcee = !dansTauri ? Number(new URLSearchParams(location.search).get("lune")) : 0;
  const lune = luneCalculee && luneForcee >= 1 && luneForcee <= 30 ? { ...luneCalculee, niveau: luneForcee, fraction: 0.7 } : luneCalculee;
  const parRang = useMemo(() => {
    const groupes: JeuPossede[][] = RANGS.map(() => []);
    for (const jeu of jeux) groupes[rangDepuisMinutes(jeu.minutesTotal).niveau].push(jeu);
    for (const g of groupes) g.sort((a, b) => b.minutesTotal - a.minutesTotal);
    return groupes;
  }, [jeux]);
  const rangMax = parRang.reduce((m, g, i) => (g.length ? i : m), 0);
  const [rang, setRang] = useState<number | null>(null);
  const rangChoisi = rang ?? rangMax;
  const [cleRang, setCleRang] = useState(0);
  const choisirRang = (i: number) => {
    setRang(i);
    setCleRang((c) => c + 1);
  };

  const dansRang = parRang[rangChoisi] ?? [];
  const imagesRecents = useImages(r.map((x) => x.appId));
  const parId = useMemo(() => new Map(jeux.map((x) => [x.appId, x])), [jeux]);

  const style = { "--profil-c1": palette[0], "--profil-c2": palette[1] } as CSSProperties;
  const nombreAmis = amis.data?.donnees.prive ? null : amis.data?.donnees.amis.length;

  return (
    <div className="profil" style={style}>
      <FondProfil p={perso} objets={objets} hero={heroFond} palette={palette} />
      <Smoke variant="hero" className="profil__fumee" />
      {perso.effet === "lucioles" && <Lucioles couleur={perso.accent} graine={ami ? Number(ami.slice(-6)) : 11} nombre={26} />}
      <EffetProfil p={perso} />

      <div className="profil__contenu">
        <section className="profil__haut" aria-labelledby="profil-nom">
          <div className="profil__avatar">
            <span className="profil__avatar-image" data-incline="">
              {avatarAffiche ? <img src={avatarAffiche.startsWith("https://") ? viaCache(avatarAffiche) : avatarAffiche} alt="" draggable={false} /> : <span className="profil__avatar-vide" />}
            </span>
            <CadreAvatar p={perso} objets={objets} />
            {!ami && <PinceauMagique onClick={() => setPanneau(true)} />}
            {lune ? (
              <LuneProfil lune={lune} points={points} niveauSteam={n?.niveau ?? null} moi={!ami} pluie={perso.effet === "pluie"} />
            ) : n && <LuneNiveau pluie={perso.effet === "pluie"} niveau={n.niveau} fraction={n.xpPourSuivant + (n.xp - n.xpNiveauActuel) > 0 ? (n.xp - n.xpNiveauActuel) / (n.xp - n.xpNiveauActuel + n.xpPourSuivant) : 1} reste={n.xpPourSuivant} />}
          </div>

          <div className="profil__identite">
            <h1 id="profil-nom" className="profil__nom">
              {j?.pseudo ?? (chargement ? "…" : "Profil")}
            </h1>
            {j && (
              <span className="profil__sous-titre">
                {[j.nomReel, pays(j.pays)].filter(Boolean).join(" · ")}
                {(j.nomReel || j.pays) && " · "}
                <span className={j.etat > 0 || j.jeuEnCours ? "profil__statut is-en-ligne" : "profil__statut"}>
                  ● {statut(j.etat, j.jeuEnCours)}
                </span>
              </span>
            )}
            {erreur && <p className="message">{estErreurApp(erreur) ? erreur.message : String(erreur)}</p>}

            <div className="profil__chiffres">
              <Chiffre icone={<IconeManette />} valeur={jeuxPrives ? "privé" : jeuxCharges ? jeux.length : null} libelle="jeux" />
              <Chiffre icone={<IconeSablier />} valeur={recentsCharges ? minutesRecentes : null} heures libelle="ces 2 semaines" />
              {ami ? (
                <Chiffre icone={<IconeAmis />} valeur={fiche?.amiDepuis ? date(fiche.amiDepuis) : "—"} libelle="ami depuis" />
              ) : (
                <Chiffre icone={<IconeAmis />} valeur={nombreAmis ?? null} libelle={nombreAmis == null && amis.data ? "amis (privé)" : "amis"} />
              )}
              <Chiffre icone={<IconeMedaille />} valeur={n ? n.badges.length : null} libelle="badges" />
              <ChiffreTrophees bilan={b ?? null} prive={tropheesPrives} />
            </div>
          </div>

          {j?.urlProfil && (
            <div className="profil__boutons">
              {ami && (
                <button type="button" className="btn btn--secondaire btn--petit" onClick={() => navigate("/amis")}>
                  ← Amis
                </button>
              )}
              <button
                type="button"
                className="btn btn--secondaire btn--petit"
                onClick={() =>
                  void api.steamLien({ type: "page", url: ami ? j.urlProfil : `${j.urlProfil.replace(/\/?$/, "/")}edit/info` })
                }
              >
                {ami ? "Voir sur Steam" : "Modifier dans Steam"}
              </button>
            </div>
          )}
        </section>

        <section className="profil__section" aria-labelledby="profil-rangs">
          <div className="profil__entete">
            <h2 id="profil-rangs" className="profil__titre">
              {ami ? "Ses rangs de temps de jeu" : "Tes rangs de temps de jeu"}
            </h2>
            <span className="profil__indice">Clique un rang pour voir les jeux qui l’ont atteint</span>
          </div>
          {jeuxPrives ? (
            <p className="placeholder-note">Sa bibliothèque est privée : Steam ne montre pas ses jeux.</p>
          ) : (
            <>
          <div className="profil-rangs" role="group" aria-label="Rangs">
            {RANGS.map((x, i) => {
              const nb = parRang[i]?.length ?? 0;
              const atteint = i <= rangMax;
              return (
                <button
                  key={x.romain}
                  type="button"
                  aria-pressed={rangChoisi === i}
                  className={`profil-rang${rangChoisi === i ? " is-actif" : ""}${nb ? " a-des-jeux" : ""}${atteint ? "" : " is-lointain"}`}
                  data-lueur=""
                  onClick={() => choisirRang(i)}
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <BadgeRang niveau={i} taille={60} />
                  <span className="profil-rang__nom">{x.nom}</span>
                  <span className="profil-rang__seuil">{x.seuil}</span>
                  <span className="profil-rang__nombre">{nb ? `${nb} jeu${nb > 1 ? "x" : ""}` : "—"}</span>
                </button>
              );
            })}
          </div>
          <div key={cleRang} className="profil-rangs__jeux">
            <span className="profil-rangs__libelle">
              Rang {RANGS[rangChoisi].romain} · {RANGS[rangChoisi].nom}
              {dansRang.length ? " :" : " : aucun jeu pour l’instant"}
            </span>
            {dansRang.slice(0, MAX_PUCES).map((jeu) => (
              <button key={jeu.appId} type="button" className="profil-puce" onClick={() => navigate(`/jeu/${jeu.appId}`)}>
                <span className="profil-puce__icone" style={jeu.icone ? { backgroundImage: `url("${viaCache(jeu.icone)}")` } : { background: degradeJaquette(jeu.nom) }} />
                <span className="profil-puce__nom">{jeu.nom}</span>
                <span className="profil-puce__h">{jeu.minutesTotal > 0 ? heures(jeu.minutesTotal) : "jamais lancé"}</span>
              </button>
            ))}
            {dansRang.length > MAX_PUCES && <span className="profil-rangs__libelle">et {dansRang.length - MAX_PUCES} autres</span>}
          </div>
            </>
          )}
        </section>

        <section className="profil__section" aria-labelledby="profil-activite">
          <div className="profil__entete">
            <h2 id="profil-activite" className="profil__titre">
              Activité récente
            </h2>
            <span className="profil__indice">{recentsCharges ? `${heures(minutesRecentes)} ces 2 dernières semaines` : ""}</span>
          </div>
          {recentsCharges && r.length === 0 && <p className="placeholder-note">Aucun jeu lancé ces deux dernières semaines.</p>}
          <div className="profil-activite">
            {r.map((jeu, i) => (
              <CarteActivite
                key={jeu.appId}
                jeu={jeu}
                dernier={parId.get(jeu.appId)?.dernierLancement ?? jeu.dernierLancement}
                jaquette={imagesDe(jeu.appId, imagesRecents.data).jaquettePetite ?? null}
                index={i}
                avecSucces={!ami}
                onOuvrir={() => navigate(`/jeu/${jeu.appId}`)}
              />
            ))}
          </div>
        </section>

        <section className="profil__section" aria-labelledby="profil-badges">
          <h2 id="profil-badges" className="profil__titre">
            Badges <span className="profil__compte">{n ? n.badges.length : ""}</span>
          </h2>
          {n && n.badges.length === 0 && <p className="placeholder-note">Pas encore de badge.</p>}
          <div className="profil-badges">
            {[...(n?.badges ?? [])]
              .sort((a, b) => b.xp - a.xp)
              .slice(0, 18)
              .map((b, i) => (
                <PastilleBadge key={`${b.id}-${b.appId}`} badge={b} nomJeu={b.appId ? parId.get(b.appId)?.nom ?? null : null} index={i} />
              ))}
          </div>
        </section>
      </div>
      {panneau && !ami && <PanneauPersonnalisation objets={objets} favoris={favoris} images={imagesFavoris.data} onFermer={() => setPanneau(false)} />}
    </div>
  );
}

// ——— Croissant de niveau et pluie lunaire ———

const GOUTTES = [
  { left: 8, delai: 0, duree: 2.4 },
  { left: 17, delai: 0.9, duree: 2.9 },
  { left: 25, delai: 0.3, duree: 2.2 },
  { left: 33, delai: 1.6, duree: 2.7 },
  { left: 41, delai: 0.6, duree: 2.5 },
  { left: 49, delai: 1.2, duree: 3.1 },
  { left: 56, delai: 2, duree: 2.3 },
  { left: 21, delai: 1.4, duree: 3.4, point: true },
  { left: 45, delai: 0.2, duree: 3.6, point: true },
];

function LuneNiveau({ niveau, fraction, reste, pluie = true }: { niveau: number; fraction: number; reste: number; pluie?: boolean }) {
  const id = useId().replace(/:/g, "");
  const v = Math.min(1, Math.max(0, fraction));
  return (
    <div className="lune-niveau" title={`Niveau Steam ${niveau} · encore ${entier(reste)} XP pour le niveau ${niveau + 1}`}>
      <div className="lune-niveau__pluie" aria-hidden="true" hidden={!pluie}>
        {GOUTTES.map((g, i) => (
          <span
            key={i}
            className={`lune-niveau__goutte${g.point ? " is-point" : ""}`}
            style={{ left: g.left, animationDelay: `${g.delai}s`, animationDuration: `${g.duree}s` }}
          />
        ))}
      </div>
      <div className="lune-niveau__disque" aria-hidden="true" />
      <svg aria-hidden="true" width="96" height="96" viewBox="0 0 72 72" className="lune-niveau__svg">
        <defs>
          <linearGradient id={`lvG${id}`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#AFC0E8" />
          </linearGradient>
          <mask id={`lvM${id}`}>
            <rect width="72" height="72" fill="#000" />
            <circle cx="36" cy="36" r="31" fill="#fff" />
            <circle cx="42" cy="30" r="25" fill="#000" />
          </mask>
        </defs>
        <g mask={`url(#lvM${id})`}>
          <rect width="72" height="72" fill="rgba(238,242,255,.14)" />
          <circle
            cx="36"
            cy="36"
            r="28"
            fill="none"
            stroke={`url(#lvG${id})`}
            strokeWidth="18"
            strokeDasharray={`${(152 * v).toFixed(1)} 999`}
            transform="matrix(-1 0 0 1 72 0) rotate(-104 36 36)"
            className="lune-niveau__arc"
          />
        </g>
        <circle cx="58" cy="13" r="1.4" fill="#EEF2FF" className="lune-niveau__etoile" />
        <circle cx="64" cy="22" r=".9" fill="#EEF2FF" opacity=".7" className="lune-niveau__etoile is-2" />
      </svg>
      <div className="lune-niveau__texte">
        <strong>{niveau}</strong>
        <span>NIVEAU</span>
      </div>
    </div>
  );
}

// ——— Chiffres ———

/** Case « Trophées » : le total qui défile, et au survol le détail (100 %, le plus rare, le dernier). */
function ChiffreTrophees({ bilan, prive }: { bilan: BilanTrophees | null; prive: boolean }) {
  const nomJeu = useNomJeu(bilan?.plusRare?.appId);
  const nomDernier = useNomJeu(bilan?.dernier?.appId);
  return (
    <div className="profil-chiffre profil-trophees" data-lueur="" tabIndex={bilan ? 0 : -1}>
      <IconeTrophee />
      <div className="profil-chiffre__texte">
        <strong>{prive ? "privé" : bilan ? <Compteur valeur={bilan.total} heures={false} /> : "—"}</strong>
        <span>trophées</span>
      </div>
      {bilan && (
        <div className="profil-trophees__detail" role="tooltip">
          <span>
            <strong>{bilan.complets.length}</strong> jeu{bilan.complets.length > 1 ? "x" : ""} à 100 % · {bilan.jeux} avec des trophées
          </span>
          {bilan.plusRare && (
            <span>
              Le plus rare : <strong>{bilan.plusRare.nom}</strong>
              {nomJeu ? ` (${nomJeu})` : ""}, {bilan.plusRare.pourcentage.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % des joueurs
            </span>
          )}
          {bilan.dernier && (
            <span>
              Dernier : <strong>{bilan.dernier.nom}</strong>
              {nomDernier ? ` (${nomDernier})` : ""}, {date(bilan.dernier.date)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function IconeTrophee() {
  return (
    <svg aria-hidden="true" {...ICONE} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="rgba(238,242,255,.12)" />
      <path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 3.4M17 6h2.5a2.5 2.5 0 0 1-2.6 3.4M12 14v3.5M8.5 20.5h7M9.5 17.5h5" />
      <path d="M13.2 6.2a1.9 1.9 0 1 0 1.2 2.9 1.5 1.5 0 1 1-1.2-2.9z" fill="#EEF2FF" stroke="none" />
    </svg>
  );
}

function Chiffre({ icone, valeur, libelle, heures = false }: { icone: React.ReactNode; valeur: number | string | null; libelle: string; heures?: boolean }) {
  return (
    <div className="profil-chiffre" data-lueur="">
      {icone}
      <div className="profil-chiffre__texte">
        <strong>{valeur == null ? "—" : typeof valeur === "number" ? <Compteur valeur={valeur} heures={heures} /> : valeur}</strong>
        <span>{libelle}</span>
      </div>
    </div>
  );
}

const ICONE = { width: 34, height: 34, viewBox: "0 0 24 24", fill: "none", stroke: "#EEF2FF", strokeWidth: 1.5, className: "profil-chiffre__icone" };

function IconeManette() {
  return (
    <svg aria-hidden="true" {...ICONE}>
      <path d="M6.5 7.5h11a4.3 4.3 0 0 1 4.2 5.2l-1 4.4a2.5 2.5 0 0 1-4.3 1.1l-1.8-2.2H9.4l-1.8 2.2a2.5 2.5 0 0 1-4.3-1.1l-1-4.4a4.3 4.3 0 0 1 4.2-5.2z" fill="rgba(238,242,255,.12)" />
      <path d="M7.5 10.5v3.4M5.8 12.2h3.4" strokeLinecap="round" />
      <circle cx="16" cy="11" r="1" fill="#EEF2FF" stroke="none" />
      <circle cx="18.2" cy="13.2" r="1" fill="#EEF2FF" stroke="none" />
    </svg>
  );
}
function IconeSablier() {
  return (
    <svg aria-hidden="true" {...ICONE} strokeLinecap="round">
      <path d="M6 3h12M6 21h12" />
      <path d="M7.5 3c0 5 4.5 6 4.5 9s-4.5 4-4.5 9M16.5 3c0 5-4.5 6-4.5 9s4.5 4 4.5 9" fill="rgba(238,242,255,.1)" />
      <path d="M9.3 19.8h5.4L12 16.6z" fill="#EEF2FF" stroke="none" />
      <path d="M10.2 7.5h3.6L12 9.6z" fill="#EEF2FF" stroke="none" opacity=".6" />
    </svg>
  );
}
function IconeAmis() {
  return (
    <svg aria-hidden="true" {...ICONE}>
      <circle cx="9" cy="8" r="3.4" fill="rgba(238,242,255,.12)" />
      <path d="M2.8 20c.7-3.6 3.2-5.6 6.2-5.6s5.5 2 6.2 5.6" fill="rgba(238,242,255,.12)" strokeLinecap="round" />
      <circle cx="17.2" cy="9" r="2.6" />
      <path d="M16.8 14.4c2.4.1 4.1 1.8 4.6 4.9" strokeLinecap="round" />
    </svg>
  );
}
function IconeMedaille() {
  return (
    <svg aria-hidden="true" {...ICONE}>
      <path d="M8 2.5l3 6.5M16 2.5l-3 6.5" strokeLinecap="round" />
      <circle cx="12" cy="15" r="6" fill="rgba(238,242,255,.12)" />
      <path d="M12 11.6l1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z" fill="#EEF2FF" stroke="none" />
    </svg>
  );
}

// ——— Activité récente ———

function CarteActivite({
  jeu,
  dernier,
  jaquette,
  index,
  avecSucces,
  onOuvrir,
}: {
  jeu: JeuPossede;
  dernier: number;
  jaquette: string | null;
  index: number;
  /** Les succès lus sont ceux du compte connecté : pas sur le profil d'un ami. */
  avecSucces: boolean;
  onOuvrir: () => void;
}) {
  const succes = useSuccesJeu(avecSucces ? jeu.appId : null);
  const s = succes.data?.donnees;
  const r = rangDepuisMinutes(jeu.minutesTotal);
  const [ratee, setRatee] = useState(false);
  return (
    <button type="button" className="profil-carte" data-lueur="" onClick={onOuvrir} style={{ animationDelay: `${index * 70}ms` }}>
      <div className="profil-carte__art" style={jaquette && !ratee ? undefined : { background: degradeJaquette(jeu.nom) }}>
        {jaquette && !ratee && <img src={jaquette} alt="" loading="lazy" draggable={false} onError={() => setRatee(true)} />}
      </div>
      <div className="profil-carte__corps">
        <div className="profil-carte__texte">
          <span className="profil-carte__nom">{jeu.nom}</span>
          <span className="profil-carte__meta">
            {heures(jeu.minutesTotal)}
            {dernier > 0 && ` · joué le ${date(dernier)}`}
          </span>
          <span className="profil-carte__rang">
            {r.niveau > 0 ? `Rang ${r.romain} · ${r.nom}` : "Novice"} · {heures(jeu.minutesDeuxSemaines)} ces 2 semaines
          </span>
        </div>
        {s && s.total > 0 && <Croissant valeur={s.debloques / s.total} texte={`${s.debloques}/${s.total}`} taille={64} />}
      </div>
    </button>
  );
}

// ——— Badges ———

/** Badges communautaires connus (les autres n'ont pas de nom dans l'API). */
const BADGES_COMMUNAUTE: Record<number, string> = {
  1: "Années de service",
  13: "Collectionneur de jeux",
};

function PastilleBadge({ badge, nomJeu, index }: { badge: Badge; nomJeu: string | null; index: number }) {
  const nom = badge.appId ? `${nomJeu ?? "Badge de jeu"}` : (BADGES_COMMUNAUTE[badge.id] ?? "Badge communautaire");
  const detail = badge.appId
    ? `niveau ${badge.niveau}`
    : badge.id === 1
      ? `${badge.niveau} an${badge.niveau > 1 ? "s" : ""}`
      : badge.id === 13
        ? `${badge.niveau} jeux`
        : `niveau ${badge.niveau}`;
  return (
    <div
      className={`profil-badge${badge.appId ? " is-jeu" : ""}`}
      title={`${nom} · ${detail} · ${entier(badge.xp)} XP${badge.obtenuLe ? ` · obtenu le ${date(badge.obtenuLe)}` : ""}`}
      style={{ animationDelay: `${index * 45}ms` }}
    >
      <span className="profil-badge__disque">
        <span className="profil-badge__niveau">{badge.niveau}</span>
      </span>
      <span className="profil-badge__nom">{nom}</span>
      <span className="profil-badge__detail">{detail}</span>
    </div>
  );
}
