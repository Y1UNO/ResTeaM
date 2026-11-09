import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { create } from "zustand";
import type { JeuBibliotheque, ObjetsProfil } from "../../api/types";
import { viaCache } from "../../lib/imageLocale";
import { enregistrerMediaPerso } from "../../api/commandes";
import { estErreurApp } from "../../api/types";
import { imagesDe } from "../../lib/images";
import type { ImagesJeu } from "../../api/types";
import "./personnalisation.css";
import { PartageProfil } from "./PartageProfil";

/*
 * Personnalisation du profil (demande de Tom) : fond, cadre autour de l'avatar,
 * effet d'ambiance et couleur. Les objets Steam équipés (fond animé, cadre,
 * avatar animé) sont proposés en premier ; ResTeaM ajoute ses propres styles.
 * Gardée sur ce PC ; partagée avec les amis seulement si Tom l'active (serveur
 * de partage des profils, voir `PartageProfil.tsx`).
 */

export type ChoixFond = "steam" | "banniere" | "avatar" | "nebuleuse" | "aurore" | "jeu";
export type ChoixCadre = "steam" | "aucun" | "lune" | "lianes" | "engrenages" | "aura";
export type ChoixEffet = "pluie" | "lucioles" | "etoiles" | "aucun";

export type Personnalisation = {
  fond: ChoixFond;
  jeuFond: number | null;
  cadre: ChoixCadre;
  avatarAnime: boolean;
  effet: ChoixEffet;
  accent: string;
  /** Avatar choisi sur le PC (`http://img.localhost/__perso__/avatar…`), visible dans ResTeaM. */
  avatarPerso: string | null;
  /** Bannière choisie sur le PC (image, GIF ou vidéo). */
  bannierePerso: string | null;
  bannierePersoVideo: boolean;
};

const CLE = "resteam.profil.personnalisation";
const DEFAUT: Personnalisation = {
  fond: "steam",
  jeuFond: null,
  cadre: "steam",
  avatarAnime: true,
  effet: "pluie",
  accent: "#9fd8ff",
  avatarPerso: null,
  bannierePerso: null,
  bannierePersoVideo: false,
};

function lire(): Personnalisation {
  try {
    const brut = localStorage.getItem(CLE);
    return brut ? { ...DEFAUT, ...(JSON.parse(brut) as Partial<Personnalisation>) } : DEFAUT;
  } catch {
    return DEFAUT;
  }
}

export const usePersonnalisation = create<{ p: Personnalisation; changer: (x: Partial<Personnalisation>) => void }>((set) => ({
  p: lire(),
  changer: (x) =>
    set((s) => {
      const p = { ...s.p, ...x };
      try {
        localStorage.setItem(CLE, JSON.stringify(p));
      } catch {
        /* stockage indisponible : le choix reste pour cette session */
      }
      return { p };
    }),
}));

export const ACCENTS = ["#9fd8ff", "#3fe08a", "#c9a6ff", "#ff9fc8", "#ffd27a", "#ff7a6b", "#eef2ff"];

// ——— Rendus ———

/** Fond du haut du profil selon le choix (vidéo Steam, nébuleuse, aurore, affiche…). */
export function FondProfil({ p, objets, hero, palette }: { p: Personnalisation; objets: ObjetsProfil | undefined; hero: string | null; palette: string[] }) {
  const fondSteam = objets?.fond;
  const choix = (p.fond === "steam" && !fondSteam) || (p.fond === "banniere" && !p.bannierePerso) ? "avatar" : p.fond;
  const style = { "--accent-profil": p.accent, "--c1": palette[0], "--c2": palette[1] } as CSSProperties;
  return (
    <div key={choix + (p.jeuFond ?? "")} className={`fond-profil is-${choix}`} style={style} aria-hidden="true">
      {choix === "steam" && fondSteam && (
        fondSteam.videoWebm || fondSteam.videoMp4 ? (
          <video className="fond-profil__media" autoPlay loop muted playsInline poster={fondSteam.image ?? undefined}>
            {fondSteam.videoWebm && <source src={fondSteam.videoWebm} type="video/webm" />}
            {fondSteam.videoMp4 && <source src={fondSteam.videoMp4} type="video/mp4" />}
          </video>
        ) : (
          fondSteam.image && <img className="fond-profil__media" src={viaCache(fondSteam.image)} alt="" />
        )
      )}
      {choix === "jeu" && hero && <div className="fond-profil__media fond-profil__affiche" style={{ backgroundImage: `url("${hero}")` }} />}
      {choix === "banniere" &&
        p.bannierePerso &&
        (p.bannierePersoVideo ? (
          <video className="fond-profil__media fond-profil__perso" src={p.bannierePerso} autoPlay loop muted playsInline />
        ) : (
          <img className="fond-profil__media fond-profil__perso" src={p.bannierePerso} alt="" />
        ))}
      {choix === "nebuleuse" && (
        <>
          <span className="fond-profil__nebuleuse n1" />
          <span className="fond-profil__nebuleuse n2" />
          <span className="fond-profil__nebuleuse n3" />
        </>
      )}
      {choix === "aurore" && (
        <>
          <span className="fond-profil__aurore a1" />
          <span className="fond-profil__aurore a2" />
        </>
      )}
      <span className="fond-profil__voile" />
    </div>
  );
}

/** Dents d'engrenage pour le cadre « Engrenages ». */
function dents(r1: number, r2: number, n: number) {
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = a + (Math.PI * 2) / n / 2.2;
    const p = (r: number, t: number) => `${(100 + Math.cos(t) * r).toFixed(1)} ${(100 + Math.sin(t) * r).toFixed(1)}`;
    d += `M${p(r1, a)}L${p(r2, a + 0.03)}L${p(r2, b - 0.03)}L${p(r1, b)}`;
  }
  return d;
}

/** Liane ondulée autour de l'avatar : tige, feuilles orientées le long de la tige, fleurs. */
function Liane() {
  const N = 120;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2;
    const r = 96 + Math.sin(t * 7) * 3.2;
    pts.push(`${(100 + Math.cos(t) * r).toFixed(1)},${(100 + Math.sin(t) * r).toFixed(1)}`);
  }
  const feuilles = Array.from({ length: 14 }, (_, i) => {
    const t = (i / 14) * Math.PI * 2 + 0.2;
    const r = 96 + Math.sin(t * 7) * 3.2;
    const x = 100 + Math.cos(t) * r;
    const y = 100 + Math.sin(t) * r;
    // Une feuille dehors, une dedans, penchée dans le sens de la tige.
    const angle = (t * 180) / Math.PI + (i % 2 ? 60 : -120);
    return { x, y, angle, taille: i % 3 === 0 ? 1.25 : 1, delai: i * 0.35 };
  });
  return (
    <svg viewBox="0 0 200 200" className="cadre-avatar__svg cadre-avatar__liane">
      <polyline points={pts.join(" ")} fill="none" stroke="color-mix(in srgb, var(--accent-profil) 70%, #2a6a3a)" strokeWidth="2.4" strokeLinecap="round" />
      <polyline points={pts.join(" ")} fill="none" stroke="var(--accent-profil)" strokeWidth="0.8" opacity="0.6" strokeDasharray="3 9" />
      {feuilles.map((f, i) => (
        <g key={i} transform={`translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) rotate(${f.angle.toFixed(0)}) scale(${f.taille})`}>
          <path className="cadre-avatar__feuille" style={{ animationDelay: `${f.delai}s` }} d="M0 0 C4 -3 10 -3 13 0 C10 3 4 3 0 0z" fill="var(--accent-profil)" />
        </g>
      ))}
      {[0.9, 3.0, 5.1].map((t, i) => (
        <g key={i} transform={`translate(${(100 + Math.cos(t) * 98).toFixed(1)} ${(100 + Math.sin(t) * 98).toFixed(1)})`}>
          <circle className="cadre-avatar__fleur" r="3.4" fill="#fff" style={{ animationDelay: `${i * 0.9}s` }} />
          <circle r="1.4" fill="var(--accent-profil)" />
        </g>
      ))}
    </svg>
  );
}

/** Cadre autour de l'avatar (objet Steam ou style ResTeaM). */
export function CadreAvatar({ p, objets }: { p: Personnalisation; objets: ObjetsProfil | undefined }) {
  const choix = p.cadre === "steam" && !objets?.cadre?.image ? "lune" : p.cadre;
  const style = { "--accent-profil": p.accent } as CSSProperties;
  if (choix === "aucun") return null;
  if (choix === "steam") return <img className="cadre-avatar cadre-avatar--steam" src={viaCache(objets!.cadre!.image!)} alt="" draggable={false} />;
  return (
    <span className={`cadre-avatar is-${choix}`} style={style} aria-hidden="true">
      {choix === "lune" && (
        <span className="cadre-avatar__orbite">
          <span />
          <span />
          <span />
        </span>
      )}
      {choix === "engrenages" && (
        <svg viewBox="0 0 200 200" className="cadre-avatar__svg">
          <path d={dents(96, 104, 36)} fill="var(--accent-profil)" opacity="0.85" />
          <circle cx="100" cy="100" r="96" fill="none" stroke="var(--accent-profil)" strokeWidth="2" opacity="0.8" />
        </svg>
      )}
      {choix === "lianes" && <Liane />}
      {choix === "aura" && <span className="cadre-avatar__aura" />}
    </span>
  );
}

/** Petit générateur stable : les gouttes ne bougent pas d'un rendu à l'autre. */
function hasard(graine: number) {
  let x = graine;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}
const GOUTTES = (() => {
  const r = hasard(42);
  return Array.from({ length: 70 }, () => ({
    left: `${(r() * 100).toFixed(2)}%`,
    duree: `${(1.1 + r() * 1.1).toFixed(2)}s`,
    delai: `${(-r() * 3).toFixed(2)}s`,
    taille: 10 + r() * 16,
    point: r() < 0.18,
  }));
})();
const ETOILES = (() => {
  const r = hasard(7);
  return Array.from({ length: 7 }, (_, i) => ({
    top: `${(r() * 55).toFixed(1)}%`,
    left: `${(35 + r() * 65).toFixed(1)}%`,
    duree: `${(4 + r() * 3).toFixed(1)}s`,
    delai: `${(i * 1.1 + r()).toFixed(1)}s`,
  }));
})();

/**
 * Ambiance en plein écran (demande de Tom) : la pluie lunaire (les mêmes gouttes que
 * sous la lune du niveau) ou des étoiles filantes, derrière le contenu du profil.
 * Uniquement des transformations : la carte graphique s'en charge.
 */
export function EffetProfil({ p }: { p: Personnalisation }) {
  const style = { "--accent-profil": p.accent } as CSSProperties;
  if (p.effet === "pluie")
    return (
      <div className="effet-plein effet-pluie" aria-hidden="true" style={style}>
        {GOUTTES.map((g, i) => (
          <span
            key={i}
            className={g.point ? "is-point" : undefined}
            style={{ left: g.left, height: g.point ? 3 : g.taille, animationDuration: g.duree, animationDelay: g.delai }}
          />
        ))}
      </div>
    );
  if (p.effet === "etoiles")
    return (
      <div className="effet-plein effet-etoiles" aria-hidden="true" style={style}>
        {ETOILES.map((e, i) => (
          <span key={i} style={{ top: e.top, left: e.left, animationDuration: e.duree, animationDelay: e.delai }} />
        ))}
      </div>
    );
  return null;
}

// ——— Pinceau magique et panneau ———

/** Bouton « pinceau magique » qui ouvre le panneau de personnalisation. */
export function PinceauMagique({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="pinceau" onClick={onClick} aria-label="Personnaliser mon profil" title="Personnaliser mon profil">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14.5 4.5l5 5L10 19l-5.5.5L5 14z" />
        <path d="M13 6l5 5" />
      </svg>
      <span className="pinceau__etincelle e1" />
      <span className="pinceau__etincelle e2" />
      <span className="pinceau__etincelle e3" />
    </button>
  );
}

function Choix<T extends string>({ titre, valeur, options, onChange }: { titre: string; valeur: T; options: { id: T; libelle: string; apercu?: ReactNode; inactif?: boolean }[]; onChange: (v: T) => void }) {
  return (
    <div className="perso__groupe">
      <span className="perso__titre">{titre}</span>
      <div className="perso__options">
        {options.map((o) => (
          <button key={o.id} type="button" disabled={o.inactif} className={`perso__option${valeur === o.id ? " is-actif" : ""}`} onClick={() => onChange(o.id)}>
            <span className={`perso__apercu apercu-${o.id}`}>{o.apercu}</span>
            <span>{o.libelle}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function PanneauPersonnalisation({
  objets,
  favoris,
  images,
  onFermer,
}: {
  objets: ObjetsProfil | undefined;
  favoris: JeuBibliotheque[];
  images: Record<string, ImagesJeu> | undefined;
  onFermer: () => void;
}) {
  const { p, changer } = usePersonnalisation();
  const [sortie, setSortie] = useState(false);
  const fermer = () => {
    setSortie(true);
    window.setTimeout(onFermer, 320);
  };
  useEffect(() => {
    const t = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  });

  return (
    <aside className={`perso${sortie ? " is-sortie" : ""}`} role="dialog" aria-label="Personnaliser mon profil" style={{ "--accent-profil": p.accent } as CSSProperties}>
      <div className="perso__entete">
        <strong>Personnaliser</strong>
        <button type="button" className="prop__fermer" aria-label="Fermer" onClick={fermer}>
          ×
        </button>
      </div>
      <p className="perso__note">Tes objets Steam (fond, cadre, avatar animé) viennent de la boutique des points Steam. Tes styles ResTeaM restent sur ce PC, sauf si tu les partages.</p>

      <PartageProfil p={p} />

      <MesFichiers />

      <Choix<ChoixFond>
        titre="Fond"
        valeur={p.fond}
        onChange={(fond) => changer({ fond })}
        options={[
          { id: "steam", libelle: objets?.fond ? objets.fond.nom || "Fond Steam" : "Fond Steam (aucun)", inactif: !objets?.fond, apercu: objets?.fond?.image ? <img src={viaCache(objets.fond.image)} alt="" /> : null },
          {
            id: "banniere",
            libelle: p.bannierePerso ? "Ma bannière" : "Ma bannière (à choisir)",
            inactif: !p.bannierePerso,
            apercu: p.bannierePerso ? (p.bannierePersoVideo ? <video src={p.bannierePerso} muted autoPlay loop playsInline /> : <img src={p.bannierePerso} alt="" />) : null,
          },
          { id: "avatar", libelle: "Couleurs de l’avatar" },
          { id: "nebuleuse", libelle: "Nébuleuse" },
          { id: "aurore", libelle: "Aurore" },
          { id: "jeu", libelle: "Affiche d’un favori", inactif: favoris.length === 0 },
        ]}
      />
      {p.fond === "jeu" && (
        <div className="perso__jeux">
          {favoris.slice(0, 12).map((j) => {
            const im = imagesDe(j.appId, images);
            return (
              <button key={j.appId} type="button" className={`perso__jeu${p.jeuFond === j.appId ? " is-actif" : ""}`} onClick={() => changer({ jeuFond: j.appId })} title={j.nom} style={{ backgroundImage: `url("${im.jaquettePetite}")` }} />
            );
          })}
        </div>
      )}

      <Choix<ChoixCadre>
        titre="Cadre de l’avatar"
        valeur={p.cadre}
        onChange={(cadre) => changer({ cadre })}
        options={[
          { id: "steam", libelle: objets?.cadre ? objets.cadre.nom || "Cadre Steam" : "Cadre Steam (aucun)", inactif: !objets?.cadre, apercu: objets?.cadre?.image ? <img src={viaCache(objets.cadre.image)} alt="" /> : null },
          { id: "lune", libelle: "Lunes en orbite" },
          { id: "lianes", libelle: "Lianes" },
          { id: "engrenages", libelle: "Engrenages" },
          { id: "aura", libelle: "Aura" },
          { id: "aucun", libelle: "Aucun" },
        ]}
      />

      {objets?.avatarAnime && (
        <label className="perso__case">
          <input type="checkbox" checked={p.avatarAnime} onChange={(e) => changer({ avatarAnime: e.target.checked })} />
          Avatar animé Steam ({objets.avatarAnime.nom})
        </label>
      )}

      <Choix<ChoixEffet>
        titre="Ambiance"
        valeur={p.effet}
        onChange={(effet) => changer({ effet })}
        options={[
          { id: "pluie", libelle: "Pluie lunaire" },
          { id: "lucioles", libelle: "Lucioles" },
          { id: "etoiles", libelle: "Étoiles filantes" },
          { id: "aucun", libelle: "Calme" },
        ]}
      />

      <div className="perso__groupe">
        <span className="perso__titre">Couleur</span>
        <div className="perso__couleurs">
          {ACCENTS.map((c) => (
            <button key={c} type="button" className={`perso__couleur${p.accent === c ? " is-actif" : ""}`} style={{ background: c }} aria-label={`Couleur ${c}`} onClick={() => changer({ accent: c })} />
          ))}
        </div>
      </div>
    </aside>
  );
}

/** Choisir sa propre photo et sa propre bannière (image, GIF, vidéo), hors Steam. */
function MesFichiers() {
  const { p, changer } = usePersonnalisation();
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const choisir = (nom: "avatar" | "banniere") => {
    const entree = document.createElement("input");
    entree.type = "file";
    entree.accept = nom === "avatar" ? "image/png,image/jpeg,image/gif,image/webp" : "image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm";
    entree.onchange = () => {
      const f = entree.files?.[0];
      if (!f) return;
      setEnvoi(nom);
      setErreur(null);
      enregistrerMediaPerso(nom, f)
        .then((url) =>
          nom === "avatar"
            ? changer({ avatarPerso: url })
            : changer({ bannierePerso: url, bannierePersoVideo: f.type.startsWith("video/"), fond: "banniere" }),
        )
        .catch((e) => setErreur(estErreurApp(e) ? e.message : String(e)))
        .finally(() => setEnvoi(null));
    };
    entree.click();
  };
  return (
    <div className="perso__groupe">
      <span className="perso__titre">Tes fichiers</span>
      <div className="perso__fichiers">
        <div className="perso__fichier">
          <span className="perso__fichier-apercu is-rond">{p.avatarPerso ? <img src={p.avatarPerso} alt="" /> : "?"}</span>
          <div>
            <strong>Ma photo</strong>
            <span>PNG, JPG, GIF animé, WebP</span>
            <div className="perso__fichier-boutons">
              <button type="button" className="btn btn--secondaire btn--petit" disabled={envoi === "avatar"} onClick={() => choisir("avatar")}>
                {envoi === "avatar" ? "Envoi…" : "Choisir…"}
              </button>
              {p.avatarPerso && (
                <button type="button" className="btn btn--lien" onClick={() => changer({ avatarPerso: null })}>
                  Retirer
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="perso__fichier">
          <span className="perso__fichier-apercu">
            {p.bannierePerso ? p.bannierePersoVideo ? <video src={p.bannierePerso} muted autoPlay loop playsInline /> : <img src={p.bannierePerso} alt="" /> : "?"}
          </span>
          <div>
            <strong>Ma bannière</strong>
            <span>Image, GIF ou vidéo (MP4, WebM) ; 60 Mo au plus pour la partager</span>
            <div className="perso__fichier-boutons">
              <button type="button" className="btn btn--secondaire btn--petit" disabled={envoi === "banniere"} onClick={() => choisir("banniere")}>
                {envoi === "banniere" ? "Envoi…" : "Choisir…"}
              </button>
              {p.bannierePerso && (
                <button type="button" className="btn btn--lien" onClick={() => changer({ bannierePerso: null, fond: p.fond === "banniere" ? "steam" : p.fond })}>
                  Retirer
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      {erreur && <p className="message">{erreur}</p>}
      <p className="perso__note">Ta photo et ta bannière sont visibles dans ResTeaM (et par tes amis si tu partages). Steam garde ton avatar Steam.</p>
    </div>
  );
}
