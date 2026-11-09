import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { create } from "zustand";
import type { JeuBibliotheque, ObjetsProfil } from "../../api/types";
import { viaCache } from "../../lib/imageLocale";
import { imagesDe } from "../../lib/images";
import type { ImagesJeu } from "../../api/types";
import "./personnalisation.css";

/*
 * Personnalisation du profil (demande de Tom) : fond, cadre autour de l'avatar,
 * effet d'ambiance et couleur. Les objets Steam équipés (fond animé, cadre,
 * avatar animé) sont proposés en premier ; ResTeaM ajoute ses propres styles.
 * Gardée sur ce PC (les amis voient tes objets Steam, pas les choix ResTeaM :
 * il faudrait un serveur pour les partager).
 */

export type ChoixFond = "steam" | "avatar" | "nebuleuse" | "aurore" | "jeu";
export type ChoixCadre = "steam" | "aucun" | "lune" | "lianes" | "engrenages" | "aura";
export type ChoixEffet = "pluie" | "lucioles" | "etoiles" | "aucun";

export type Personnalisation = {
  fond: ChoixFond;
  jeuFond: number | null;
  cadre: ChoixCadre;
  avatarAnime: boolean;
  effet: ChoixEffet;
  accent: string;
};

const CLE = "resteam.profil.personnalisation";
const DEFAUT: Personnalisation = { fond: "steam", jeuFond: null, cadre: "steam", avatarAnime: true, effet: "pluie", accent: "#9fd8ff" };

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
  const choix = p.fond === "steam" && !fondSteam ? "avatar" : p.fond;
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
      {choix === "lianes" && (
        <svg viewBox="0 0 200 200" className="cadre-avatar__svg">
          <circle cx="100" cy="100" r="97" fill="none" stroke="var(--accent-profil)" strokeWidth="1.6" strokeDasharray="10 6" opacity="0.7" />
          {Array.from({ length: 12 }, (_, i) => (
            <path
              key={i}
              className="cadre-avatar__feuille"
              d="M100 0 q8 6 0 16 q-8 -10 0 -16z"
              fill="var(--accent-profil)"
              transform={`rotate(${i * 30} 100 100) translate(0 -2)`}
              style={{ animationDelay: `${i * 0.25}s` }}
            />
          ))}
        </svg>
      )}
      {choix === "aura" && <span className="cadre-avatar__aura" />}
    </span>
  );
}

/** Effet d'ambiance du haut du profil (étoiles filantes, pluie lunaire…). */
export function EffetProfil({ p }: { p: Personnalisation }) {
  if (p.effet !== "etoiles") return null;
  return (
    <div className="effet-etoiles" aria-hidden="true" style={{ "--accent-profil": p.accent } as CSSProperties}>
      {Array.from({ length: 7 }, (_, i) => (
        <span key={i} style={{ top: `${5 + ((i * 13) % 45)}%`, left: `${20 + ((i * 29) % 75)}%`, animationDelay: `${i * 1.7}s` }} />
      ))}
    </div>
  );
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
      <p className="perso__note">Tes objets Steam (fond, cadre, avatar animé) viennent de la boutique des points Steam. Les styles ResTeaM restent sur ce PC.</p>

      <Choix<ChoixFond>
        titre="Fond"
        valeur={p.fond}
        onChange={(fond) => changer({ fond })}
        options={[
          { id: "steam", libelle: objets?.fond ? objets.fond.nom || "Fond Steam" : "Fond Steam (aucun)", inactif: !objets?.fond, apercu: objets?.fond?.image ? <img src={viaCache(objets.fond.image)} alt="" /> : null },
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
