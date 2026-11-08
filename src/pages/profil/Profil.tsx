import { useId, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/commandes";
import {
  useAmis,
  useBibliotheque,
  useImages,
  useJoueurMoi,
  useNiveauBadges,
  useRecemmentJoues,
  useSuccesJeu,
} from "../../api/requetes";
import { estErreurApp, type Badge, type JeuBibliotheque, type JeuPossede } from "../../api/types";
import { Croissant } from "../../components/Croissant";
import { Smoke } from "../../components/Smoke";
import { usePalette } from "../../lib/couleurs";
import { date, entier, heures, statut } from "../../lib/format";
import { degradeJaquette, imagesDe } from "../../lib/images";
import { NOMS_RANGS, PALIERS, ROMAINS, rangDepuisMinutes } from "../../lib/rangs";
import "../pages.css";
import "./profil.css";

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
  const navigate = useNavigate();
  const joueur = useJoueurMoi();
  const niveau = useNiveauBadges();
  const biblio = useBibliotheque();
  const recents = useRecemmentJoues();
  const amis = useAmis();
  const j = joueur.data?.donnees;
  const n = niveau.data?.donnees;
  const jeux = useMemo(() => (biblio.data?.donnees.jeux ?? []).filter((x) => !x.cache), [biblio.data]);
  const r = recents.data?.donnees ?? [];
  const palette = usePalette(j?.avatar ?? null, j?.pseudo ?? "Profil");

  const minutesRecentes = r.reduce((s, x) => s + x.minutesDeuxSemaines, 0);
  const parRang = useMemo(() => {
    const groupes: JeuBibliotheque[][] = RANGS.map(() => []);
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
      <div className="profil__fond" aria-hidden="true" />
      <div className="profil__voile" aria-hidden="true" />
      <Smoke variant="hero" className="profil__fumee" />

      <div className="profil__contenu">
        <section className="profil__haut" aria-labelledby="profil-nom">
          <div className="profil__avatar">
            {j?.avatar ? <img src={j.avatar} alt="" draggable={false} /> : <div className="profil__avatar-vide" />}
            {n && <LuneNiveau niveau={n.niveau} fraction={n.xpPourSuivant + (n.xp - n.xpNiveauActuel) > 0 ? (n.xp - n.xpNiveauActuel) / (n.xp - n.xpNiveauActuel + n.xpPourSuivant) : 1} reste={n.xpPourSuivant} />}
          </div>

          <div className="profil__identite">
            <h1 id="profil-nom" className="profil__nom">
              {j?.pseudo ?? (joueur.isLoading ? "…" : "Profil")}
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
            {joueur.isError && <p className="message">{estErreurApp(joueur.error) ? joueur.error.message : String(joueur.error)}</p>}

            <div className="profil__chiffres">
              <Chiffre icone={<IconeManette />} valeur={biblio.data ? entier(jeux.length) : "—"} libelle="jeux" />
              <Chiffre icone={<IconeSablier />} valeur={recents.data ? heures(minutesRecentes) : "—"} libelle="ces 2 semaines" />
              <Chiffre icone={<IconeAmis />} valeur={nombreAmis != null ? entier(nombreAmis) : "—"} libelle={nombreAmis == null && amis.data ? "amis (privé)" : "amis"} />
              <Chiffre icone={<IconeMedaille />} valeur={n ? entier(n.badges.length) : "—"} libelle="badges" />
            </div>
          </div>

          {j?.urlProfil && (
            <button
              type="button"
              className="btn btn--secondaire btn--petit profil__modifier"
              onClick={() => void api.steamLien({ type: "page", url: `${j.urlProfil.replace(/\/?$/, "/")}edit/info` })}
            >
              Modifier dans Steam
            </button>
          )}
        </section>

        <section className="profil__section" aria-labelledby="profil-rangs">
          <div className="profil__entete">
            <h2 id="profil-rangs" className="profil__titre">
              Tes rangs de temps de jeu
            </h2>
            <span className="profil__indice">Clique un rang pour voir les jeux qui l’ont atteint</span>
          </div>
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
                  onClick={() => choisirRang(i)}
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <span className="profil-rang__anneau">{x.romain}</span>
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
                <span className="profil-puce__icone" style={jeu.icone ? { backgroundImage: `url("${jeu.icone}")` } : { background: degradeJaquette(jeu.nom) }} />
                <span className="profil-puce__nom">{jeu.nom}</span>
                <span className="profil-puce__h">{jeu.minutesTotal > 0 ? heures(jeu.minutesTotal) : "jamais lancé"}</span>
              </button>
            ))}
            {dansRang.length > MAX_PUCES && <span className="profil-rangs__libelle">et {dansRang.length - MAX_PUCES} autres</span>}
          </div>
        </section>

        <section className="profil__section" aria-labelledby="profil-activite">
          <div className="profil__entete">
            <h2 id="profil-activite" className="profil__titre">
              Activité récente
            </h2>
            <span className="profil__indice">{recents.data ? `${heures(minutesRecentes)} ces 2 dernières semaines` : ""}</span>
          </div>
          {recents.data && r.length === 0 && <p className="placeholder-note">Aucun jeu lancé ces deux dernières semaines.</p>}
          <div className="profil-activite">
            {r.map((jeu, i) => (
              <CarteActivite
                key={jeu.appId}
                jeu={jeu}
                dernier={parId.get(jeu.appId)?.dernierLancement ?? jeu.dernierLancement}
                jaquette={imagesDe(jeu.appId, imagesRecents.data).jaquettePetite ?? null}
                index={i}
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

function LuneNiveau({ niveau, fraction, reste }: { niveau: number; fraction: number; reste: number }) {
  const id = useId().replace(/:/g, "");
  const v = Math.min(1, Math.max(0, fraction));
  return (
    <div className="lune-niveau" title={`Niveau Steam ${niveau} · encore ${entier(reste)} XP pour le niveau ${niveau + 1}`}>
      <div className="lune-niveau__pluie" aria-hidden="true">
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

function Chiffre({ icone, valeur, libelle }: { icone: React.ReactNode; valeur: string; libelle: string }) {
  return (
    <div className="profil-chiffre">
      {icone}
      <div className="profil-chiffre__texte">
        <strong>{valeur}</strong>
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
  onOuvrir,
}: {
  jeu: JeuPossede;
  dernier: number;
  jaquette: string | null;
  index: number;
  onOuvrir: () => void;
}) {
  const succes = useSuccesJeu(jeu.appId);
  const s = succes.data?.donnees;
  const r = rangDepuisMinutes(jeu.minutesTotal);
  const [ratee, setRatee] = useState(false);
  return (
    <button type="button" className="profil-carte" onClick={onOuvrir} style={{ animationDelay: `${index * 70}ms` }}>
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
