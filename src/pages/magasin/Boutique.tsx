import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProduits, useRayonMagasin, useRechercheMagasin, useSouhaits } from "../../api/requetes";
import type { Produit, VitrineMagasin } from "../../api/types";
import { PATHS } from "../../app/paths";
import { date, entier } from "../../lib/format";
import { viaCache } from "../../lib/imageLocale";
import { degradeJaquette } from "../../lib/images";

// ——— Prix ———

export function BlocPrix({ p, grand = false }: { p: Produit; grand?: boolean }) {
  if (p.aVenir) return <span className={`bprix${grand ? " is-grand" : ""}`}>{p.sortieTexte ?? "À venir"}</span>;
  if (!p.prix) return <span className={`bprix${grand ? " is-grand" : ""}`}>{p.gratuit ? "Gratuit" : "—"}</span>;
  return (
    <span className={`bprix${grand ? " is-grand" : ""}`}>
      {p.prix.reduction > 0 && <span className="bprix__reduc">−{p.prix.reduction} %</span>}
      <span className="bprix__montants">
        {p.prix.reduction > 0 && <s>{p.prix.texteInitial}</s>}
        <strong>{p.prix.texteFinal}</strong>
      </span>
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
    <button type="button" className="bcarte" onClick={() => navigate(`/jeu/${p.appId}`)} style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}>
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
];

export function Rayons({ vitrine }: { vitrine: VitrineMagasin | undefined }) {
  const [rayon, setRayon] = useState<Rayon>(RAYONS[0]);
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
    <section className="boutique__bloc" aria-labelledby="rayons-titre">
      <div className="boutique__entete">
        <h2 id="rayons-titre" className="boutique__titre">
          Parcourir le magasin
        </h2>
      </div>
      <div className="brayons" role="tablist" aria-label="Rayons">
        {RAYONS.map((r) => (
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
