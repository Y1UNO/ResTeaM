import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProduits, useRayonMagasin, useRechercheMagasin, useSouhaits } from "../../api/requetes";
import type { Produit, VitrineMagasin } from "../../api/types";
import { PATHS } from "../../app/paths";
import { date, entier } from "../../lib/format";
import { viaCache } from "../../lib/imageLocale";
import { degradeJaquette } from "../../lib/images";
import { MontantDefilant, PrixPromo, Reduction } from "../../components/Prix";

// ——— Prix ———

export function BlocPrix({ p, grand = false }: { p: Produit; grand?: boolean }) {
  if (p.aVenir) return <span className={`bprix${grand ? " is-grand" : ""}`}>{p.sortieTexte ?? "À venir"}</span>;
  if (!p.prix) return <span className={`bprix${grand ? " is-grand" : ""}`}>{p.gratuit ? <strong className="bprix__gratuit">Gratuit</strong> : "—"}</span>;
  return (
    <span className={`bprix${grand ? " is-grand" : ""}`}>
      {p.prix.reduction > 0 ? (
        <>
          <Reduction pourcent={p.prix.reduction} grand={grand} />
          <PrixPromo initial={p.prix.initial} final_={p.prix.final_} grand={grand} />
        </>
      ) : (
        <strong className="bprix__seul">
          <MontantDefilant centimes={p.prix.final_} />
        </strong>
      )}
    </span>
  );
}

function Capsule({ url, nom, className }: { url: string | null; nom: string; className: string }) {
  const [ratee, setRatee] = useState(false);
  return (
    <span className={className} style={url && !ratee ? undefined : { background: degradeJaquette(nom) }}>
      {url && !ratee && <img src={viaCache(url)} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setRatee(true)} />}
    </span>
  );
}

// ——— Recherche ———

/** Barre de recherche du magasin : résultats en direct, Entrée pour tout afficher. */
export function RechercheMagasin({ onTout }: { onTout: (terme: string) => void }) {
  const navigate = useNavigate();
  const [saisie, setSaisie] = useState("");
  const [terme, setTerme] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  /** Vrai si l'utilisateur a choisi un résultat aux flèches : Entrée l'ouvre. */
  const fleches = useRef(false);
  const boite = useRef<HTMLDivElement>(null);

  // Petite pause pendant la frappe : pas une requête par lettre.
  useEffect(() => {
    const t = window.setTimeout(() => setTerme(saisie.trim()), 250);
    return () => window.clearTimeout(t);
  }, [saisie]);
  const r = useRechercheMagasin(terme);
  const resultats = terme.length >= 2 ? (r.data ?? []) : [];
  useEffect(() => setActif(0), [terme]);

  useEffect(() => {
    const clic = (e: MouseEvent) => {
      if (!boite.current?.contains(e.target as Node)) setOuvert(false);
    };
    window.addEventListener("mousedown", clic);
    return () => window.removeEventListener("mousedown", clic);
  }, []);

  const valider = () => {
    if (saisie.trim().length < 2) return;
    setOuvert(false);
    onTout(saisie.trim());
  };

  return (
    <div ref={boite} className={`brecherche${ouvert && terme.length >= 2 ? " is-ouverte" : ""}`}>
      <label className="brecherche__champ">
        <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <span className="sr-only">Rechercher dans le magasin</span>
        <input
          value={saisie}
          placeholder="Rechercher un jeu dans le magasin"
          spellCheck={false}
          role="combobox"
          aria-expanded={ouvert && resultats.length > 0}
          aria-controls="brecherche-liste"
          onFocus={() => setOuvert(true)}
          onChange={(e) => {
            fleches.current = false;
            setSaisie(e.target.value);
            setOuvert(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              fleches.current = true;
              setActif((a) => Math.min(a + 1, Math.min(resultats.length, 7) - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              fleches.current = true;
              setActif((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              const choisi = resultats[actif];
              if (choisi && ouvert && fleches.current) navigate(`/jeu/${choisi.appId}`);
              else valider();
            } else if (e.key === "Escape") {
              setOuvert(false);
            }
          }}
        />
        {r.isFetching && terme.length >= 2 && <span className="brecherche__charge" aria-hidden="true" />}
        {saisie && (
          <button type="button" className="brecherche__effacer" aria-label="Effacer" onClick={() => setSaisie("")}>
            ×
          </button>
        )}
      </label>
      {ouvert && terme.length >= 2 && (
        <div id="brecherche-liste" role="listbox" className="brecherche__liste">
          {resultats.length === 0 && !r.isFetching && <p className="brecherche__vide">Aucun jeu pour « {terme} ».</p>}
          {resultats.slice(0, 7).map((p, i) => (
            <button
              key={p.appId}
              type="button"
              role="option"
              aria-selected={i === actif}
              className={`brecherche__ligne${i === actif ? " is-actif" : ""}`}
              onMouseEnter={() => setActif(i)}
              onClick={() => navigate(`/jeu/${p.appId}`)}
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <Capsule url={p.banniere} nom={p.nom} className="brecherche__image" />
              <span className="brecherche__texte">
                <strong>{p.nom}</strong>
                <span>{p.tags.slice(0, 3).join(" · ") || (p.sortie ? date(p.sortie) : "")}</span>
              </span>
              <BlocPrix p={p} />
            </button>
          ))}
          {resultats.length > 0 && (
            <button type="button" className="brecherche__tout" onClick={valider}>
              Voir les {resultats.length} résultats
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Grille de résultats d'une recherche complète. */
export function ResultatsRecherche({ terme, onFermer }: { terme: string; onFermer: () => void }) {
  const r = useRechercheMagasin(terme);
  const liste = r.data ?? [];
  return (
    <section className="boutique__bloc" aria-labelledby="resultats-titre">
      <div className="boutique__entete">
        <h2 id="resultats-titre" className="boutique__titre">
          Résultats pour « {terme} » <span className="boutique__compte">{r.data ? liste.length : ""}</span>
        </h2>
        <button type="button" className="boutique__lien" onClick={onFermer}>
          Revenir à la boutique
        </button>
      </div>
      {r.isLoading && <p className="placeholder-note">Recherche…</p>}
      {r.data && liste.length === 0 && <p className="placeholder-note">Aucun jeu ne correspond.</p>}
      <div className="boutique__grille">
        {liste.map((p, i) => (
          <CarteProduit key={p.appId} p={p} index={i} />
        ))}
      </div>
    </section>
  );
}

export function CarteProduit({ p, index, badge }: { p: Produit; index: number; badge?: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" className="bcarte" data-lueur="" onClick={() => navigate(`/jeu/${p.appId}`)} style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}>
      <span className="bcarte__visuel">
        <Capsule url={p.capsule ?? p.banniere} nom={p.nom} className="bcarte__image" />
        {badge && <span className="bcarte__badge">{badge}</span>}
      </span>
      <span className="bcarte__corps">
        <strong className="bcarte__nom">{p.nom}</strong>
        <span className="bcarte__tags">{p.tags.slice(0, 3).join(" · ")}</span>
        <span className="bcarte__bas">
          <span className="bcarte__avis">{p.avis ? `${p.avis.pourcentage} % positives` : ""}</span>
          <BlocPrix p={p} />
        </span>
      </span>
    </button>
  );
}

// ——— Liste de souhaits (aperçu) ———

export function SouhaitsApercu() {
  const navigate = useNavigate();
  const s = useSouhaits();
  const ids = useMemo(() => (s.data?.donnees ?? []).map((x) => x.appId), [s.data]);
  const produits = useProduits(ids.slice(0, 40));
  const tries = useMemo(
    () => [...(produits.data ?? [])].sort((a, b) => (b.prix?.reduction ?? 0) - (a.prix?.reduction ?? 0)).slice(0, 4),
    [produits.data],
  );
  if (!s.data || ids.length === 0) return null;
  const enPromo = (produits.data ?? []).filter((p) => (p.prix?.reduction ?? 0) > 0).length;
  return (
    <section className="boutique__bloc" aria-labelledby="souhaits-titre">
      <div className="boutique__entete">
        <h2 id="souhaits-titre" className="boutique__titre">
          Ta liste de souhaits <span className="boutique__compte">{ids.length}</span>
        </h2>
        <span className="boutique__indice">{enPromo > 0 ? `${enPromo} en promo en ce moment` : "Rien en promo pour l’instant"}</span>
        <button type="button" className="boutique__lien" onClick={() => navigate(PATHS.souhaits)}>
          Tout voir
        </button>
      </div>
      <div className="boutique__grille boutique__grille--4">
        {tries.map((p, i) => (
          <CarteProduit key={p.appId} p={p} index={i} badge="Dans tes souhaits" />
        ))}
      </div>
    </section>
  );
}

// ——— Rayons : liste + aperçu au survol ———

type Rayon = { id: string; libelle: string; source: "vitrine" | "rayon" };

const RAYONS: Rayon[] = [
  { id: "ventes", libelle: "Meilleures ventes", source: "vitrine" },
  { id: "nouveautes", libelle: "Nouveautés", source: "vitrine" },
  { id: "aVenir", libelle: "À venir", source: "vitrine" },
  { id: "offres", libelle: "Offres", source: "vitrine" },
  { id: "gratuits", libelle: "Gratuits", source: "rayon" },
  { id: "tag:19", libelle: "Action", source: "rayon" },
  { id: "tag:21", libelle: "Aventure", source: "rayon" },
  { id: "tag:122", libelle: "RPG", source: "rayon" },
  { id: "tag:9", libelle: "Stratégie", source: "rayon" },
  { id: "tag:599", libelle: "Simulation", source: "rayon" },
  { id: "tag:492", libelle: "Indépendant", source: "rayon" },
  { id: "tag:1716", libelle: "Roguelike", source: "rayon" },
  { id: "tag:1685", libelle: "Coop", source: "rayon" },
  { id: "tag:1662", libelle: "Survie", source: "rayon" },
  { id: "tag:1667", libelle: "Horreur", source: "rayon" },
  { id: "tag:699", libelle: "Course", source: "rayon" },
  { id: "tag:701", libelle: "Sport", source: "rayon" },
  { id: "tag:1646", libelle: "Hack 'n' Slash", source: "rayon" },
  { id: "tag:29482", libelle: "Souls-like", source: "rayon" },
  { id: "tag:1663", libelle: "FPS", source: "rayon" },
  { id: "tag:1695", libelle: "Monde ouvert", source: "rayon" },
  { id: "tag:1625", libelle: "Plateforme", source: "rayon" },
  { id: "tag:1628", libelle: "Metroidvania", source: "rayon" },
  { id: "tag:4434", libelle: "RPG japonais", source: "rayon" },
  { id: "tag:1091588", libelle: "Deckbuilding", source: "rayon" },
  { id: "tag:1677", libelle: "Tour par tour", source: "rayon" },
  { id: "tag:12472", libelle: "Gestion", source: "rayon" },
  { id: "tag:3810", libelle: "Bac à sable", source: "rayon" },
  { id: "tag:1664", libelle: "Casse-tête", source: "rayon" },
  { id: "tag:176981", libelle: "Battle royale", source: "rayon" },
  { id: "tag:1754", libelle: "MMORPG", source: "rayon" },
  { id: "tag:3942", libelle: "Science-fiction", source: "rayon" },
  { id: "tag:4085", libelle: "Anime", source: "rayon" },
];
/** Rayons visibles d'emblée ; les autres derrière « Plus de genres ». */
const NB_RAYONS_VISIBLES = 17;

export function Rayons({ vitrine, demande }: { vitrine: VitrineMagasin | undefined; demande?: string | null }) {
  const [rayon, setRayon] = useState<Rayon>(RAYONS[0]);
  const [tous, setTous] = useState(false);
  const section = useRef<HTMLElement>(null);
  // Une tuile de genre (plus haut dans la page) choisit le rayon et y descend.
  useEffect(() => {
    if (!demande) return;
    const r = RAYONS.find((x) => x.id === demande.split("#")[0]);
    if (r) {
      setRayon(r);
      if (RAYONS.indexOf(r) >= NB_RAYONS_VISIBLES) setTous(true);
      section.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [demande]);
  const idsVitrine = useMemo(() => {
    if (!vitrine || rayon.source !== "vitrine") return [];
    const l =
      rayon.id === "ventes"
        ? vitrine.meilleuresVentes
        : rayon.id === "nouveautes"
          ? vitrine.nouveautes
          : rayon.id === "aVenir"
            ? (vitrine.aVenir ?? [])
            : vitrine.offres;
    return l.map((o) => o.appId);
  }, [vitrine, rayon]);
  const depuisVitrine = useProduits(idsVitrine);
  const depuisRayon = useRayonMagasin(rayon.source === "rayon" ? rayon.id : null);
  const requete = rayon.source === "vitrine" ? depuisVitrine : depuisRayon;
  const liste = (rayon.source === "vitrine" && idsVitrine.length === 0 ? [] : requete.data) ?? [];
  const [survol, setSurvol] = useState<number | null>(null);
  const apercu = liste.find((p) => p.appId === survol) ?? liste[0];
  useEffect(() => setSurvol(null), [rayon.id]);

  return (
    <section ref={section} className="boutique__bloc boutique__bloc--rayons" aria-labelledby="rayons-titre">
      <div className="boutique__entete">
        <h2 id="rayons-titre" className="boutique__titre">
          Parcourir le magasin
        </h2>
      </div>
      <div className="brayons" role="tablist" aria-label="Rayons">
        {(tous ? RAYONS : RAYONS.slice(0, NB_RAYONS_VISIBLES)).map((r) => (
          <button
            key={r.id}
            type="button"
            role="tab"
            aria-selected={rayon.id === r.id}
            className={`brayon${rayon.id === r.id ? " is-actif" : ""}${r.source === "rayon" && r.id !== "gratuits" ? " is-genre" : ""}`}
            onClick={() => setRayon(r)}
          >
            {r.libelle}
          </button>
        ))}
        <button type="button" className="brayon brayon--plus" onClick={() => setTous((t) => !t)}>
          {tous ? "Moins de genres" : `+ ${RAYONS.length - NB_RAYONS_VISIBLES} genres`}
        </button>
      </div>

      <div className="bliste">
        <div key={rayon.id} className="bliste__lignes" role="list">
          {requete.isLoading && liste.length === 0 && <p className="placeholder-note">Chargement du rayon…</p>}
          {requete.isError && <p className="message">Ce rayon ne répond pas. Réessaie dans un moment.</p>}
          {!requete.isLoading && !requete.isError && liste.length === 0 && <p className="placeholder-note">Rien dans ce rayon pour l’instant.</p>}
          {liste.slice(0, 15).map((p, i) => (
            <LigneProduit key={p.appId} p={p} index={i} actif={apercu?.appId === p.appId} onSurvol={() => setSurvol(p.appId)} />
          ))}
        </div>
        {apercu && <Apercu key={apercu.appId} p={apercu} />}
      </div>
    </section>
  );
}

function LigneProduit({ p, index, actif, onSurvol }: { p: Produit; index: number; actif: boolean; onSurvol: () => void }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      role="listitem"
      className={`bligne${actif ? " is-actif" : ""}`}
      data-lueur=""
      onMouseEnter={onSurvol}
      onFocus={onSurvol}
      onClick={() => navigate(`/jeu/${p.appId}`)}
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <Capsule url={p.banniere} nom={p.nom} className="bligne__image" />
      <span className="bligne__texte">
        <strong>{p.nom}</strong>
        <span className="bligne__tags">{p.tags.slice(0, 4).join(", ")}</span>
        <span className="bligne__date">
          {p.aVenir ? (p.sortieTexte ?? "Prochainement") : p.sortie ? `Sorti le ${date(p.sortie)}` : ""}
        </span>
      </span>
      <BlocPrix p={p} />
    </button>
  );
}

function Apercu({ p }: { p: Produit }) {
  const navigate = useNavigate();
  return (
    <aside className="bapercu" aria-label={`Aperçu de ${p.nom}`}>
      <h3 className="bapercu__nom">{p.nom}</h3>
      {p.avis && (
        <span className="bapercu__avis">
          <strong>{p.avis.libelle}</strong> · {entier(p.avis.nombre)} évaluations
        </span>
      )}
      {p.tags.length > 0 && (
        <div className="bapercu__tags">
          {p.tags.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      )}
      <div className="bapercu__captures">
        {(p.captures.length ? p.captures : [p.capsule ?? p.banniere]).slice(0, 4).map((c, i) =>
          c ? <img key={c} src={viaCache(c)} alt="" loading="lazy" draggable={false} style={{ animationDelay: `${i * 60}ms` }} /> : null,
        )}
      </div>
      <div className="bapercu__bas">
        <BlocPrix p={p} grand />
        <button type="button" className="btn btn--principal btn--petit" onClick={() => navigate(`/jeu/${p.appId}`)}>
          Voir la fiche
        </button>
      </div>
    </aside>
  );
}

// ——— Sections variées (comme la page d'accueil de Steam) ———

/** Trois grandes promos mises en avant, avec la plus grosse réduction. */
export function PromosVedettes({ vitrine }: { vitrine: VitrineMagasin | undefined }) {
  const navigate = useNavigate();
  const ids = useMemo(
    () => [...(vitrine?.offres ?? [])].sort((a, b) => b.reduction - a.reduction).slice(0, 3).map((o) => o.appId),
    [vitrine],
  );
  const produits = useProduits(ids);
  const liste = produits.data ?? [];
  if (liste.length === 0) return null;
  return (
    <section className="boutique__bloc" aria-labelledby="promos-titre">
      <div className="boutique__entete">
        <h2 id="promos-titre" className="boutique__titre">
          Promos à ne pas rater
        </h2>
        <span className="boutique__indice">les plus grosses réductions du moment</span>
      </div>
      <div className="bpromos">
        {liste.map((p, i) => (
          <button key={p.appId} type="button" data-lueur="" className={`bpromo${i === 0 ? " is-grande" : ""}`} onClick={() => navigate(`/jeu/${p.appId}`)} style={{ animationDelay: `${i * 90}ms` }}>
            <Capsule url={i === 0 ? (p.hero ?? p.capsule) : (p.capsule ?? p.banniere)} nom={p.nom} className="bpromo__image" />
            <span className="bpromo__voile" aria-hidden="true" />
            <span className="bpromo__texte">
              <strong>{p.nom}</strong>
              <span>{p.tags.slice(0, 3).join(" · ")}</span>
              <BlocPrix p={p} grand={i === 0} />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

const TUILES_GENRES: { id: string; libelle: string; teinte: number }[] = [
  { id: "tag:1646", libelle: "Hack 'n' Slash", teinte: 0 },
  { id: "tag:122", libelle: "RPG", teinte: 265 },
  { id: "tag:29482", libelle: "Souls-like", teinte: 30 },
  { id: "tag:1716", libelle: "Roguelike", teinte: 140 },
  { id: "tag:1695", libelle: "Monde ouvert", teinte: 190 },
  { id: "tag:1685", libelle: "Coop", teinte: 210 },
  { id: "tag:1667", libelle: "Horreur", teinte: 340 },
  { id: "tag:599", libelle: "Simulation", teinte: 95 },
];

/** Tuiles de genres : un clic ouvre le rayon plus bas dans la page. */
export function TuilesGenres({ onChoisir }: { onChoisir: (id: string) => void }) {
  return (
    <section className="boutique__bloc" aria-labelledby="genres-titre">
      <div className="boutique__entete">
        <h2 id="genres-titre" className="boutique__titre">
          Par genre
        </h2>
      </div>
      <div className="bgenres">
        {TUILES_GENRES.map((g, i) => (
          <button
            key={g.id}
            type="button"
            data-incline=""
            className="bgenre"
            onClick={() => onChoisir(g.id)}
            style={{ "--h": g.teinte, animationDelay: `${i * 50}ms` } as React.CSSProperties}
          >
            <span className="bgenre__nom">{g.libelle}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Rangée horizontale de capsules (gratuits populaires), défilable à la molette. */
export function RangeeGratuits() {
  const navigate = useNavigate();
  const r = useRayonMagasin("gratuits");
  const piste = useRef<HTMLDivElement>(null);
  const liste = (r.data ?? []).slice(0, 18);
  // Carrousel à flèches, comme Steam : la molette fait défiler la page normalement.
  const decaler = (sens: number) => piste.current?.scrollBy({ left: sens * piste.current.clientWidth * 0.85, behavior: "smooth" });
  if (liste.length === 0) return null;
  return (
    <section className="boutique__bloc" aria-labelledby="gratuits-titre">
      <div className="boutique__entete">
        <h2 id="gratuits-titre" className="boutique__titre">
          Gratuits et populaires
        </h2>
        <span className="boutique__indice">à essayer sans rien payer</span>
        <div className="bfleches">
          <button type="button" aria-label="Précédents" onClick={() => decaler(-1)}>
            ‹
          </button>
          <button type="button" aria-label="Suivants" onClick={() => decaler(1)}>
            ›
          </button>
        </div>
      </div>
      <div ref={piste} className="brangee">
        {liste.map((p, i) => (
          <button key={p.appId} type="button" data-lueur="" className="bcapsule" onClick={() => navigate(`/jeu/${p.appId}`)} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
            <Capsule url={p.jaquette ?? p.capsule} nom={p.nom} className="bcapsule__image" />
            <span className="bcapsule__nom">{p.nom}</span>
            <span className="bcapsule__tags">{p.tags.slice(0, 2).join(" · ")}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
