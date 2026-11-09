import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/commandes";
import { useProduits, useSouhaits } from "../api/requetes";
import { estErreurApp, type Produit } from "../api/types";
import { Smoke } from "../components/Smoke";
import { date, entier } from "../lib/format";
import { viaCache } from "../lib/imageLocale";
import { degradeJaquette } from "../lib/images";
import { PopupAchat } from "./fiche/PopupAchat";
import { BlocPrix } from "./magasin/Boutique";
import "./pages.css";
import "./magasin/boutique.css";
import "./souhaits.css";

type Tri = "ordre" | "promos" | "prix";

/**
 * Liste de souhaits (maquette 05) : bandeau des promos, tri, une ligne par jeu avec
 * Acheter (plein si en promo) et la croix de retrait, qui se gère dans Steam.
 */
export function Souhaits() {
  const navigate = useNavigate();
  const s = useSouhaits();
  const souhaits = useMemo(() => s.data?.donnees ?? [], [s.data]);
  const ids = useMemo(() => souhaits.map((x) => x.appId), [souhaits]);
  const produits = useProduits(ids);
  const [tri, setTri] = useState<Tri>("ordre");
  const [cle, setCle] = useState(0);
  const [achat, setAchat] = useState<Produit | null>(null);

  const ajoutes = useMemo(() => new Map(souhaits.map((x) => [x.appId, x.ajouteLe])), [souhaits]);
  const liste = useMemo(() => {
    const l = [...(produits.data ?? [])];
    if (tri === "promos") l.sort((a, b) => (b.prix?.reduction ?? 0) - (a.prix?.reduction ?? 0));
    if (tri === "prix") l.sort((a, b) => (a.prix?.final_ ?? (a.gratuit ? 0 : 1e9)) - (b.prix?.final_ ?? (b.gratuit ? 0 : 1e9)));
    return l;
  }, [produits.data, tri]);
  const enPromo = liste.filter((p) => (p.prix?.reduction ?? 0) > 0).length;

  const tris: { id: Tri; libelle: string }[] = [
    { id: "ordre", libelle: "Mon ordre" },
    { id: "promos", libelle: "Promos d’abord" },
    { id: "prix", libelle: "Prix" },
  ];

  return (
    <div className="page">
      <Smoke variant="top" />
      <div className="page__content souhaits">
        <header className="souhaits__entete">
          <div className="page__header">
            <h1 className="page__title">Liste de souhaits</h1>
            <span className="placeholder-note">
              {s.data ? `${entier(ids.length)} jeu${ids.length > 1 ? "x" : ""}` : "Chargement…"}
              {s.data?.horsLigne && " · hors ligne"}
            </span>
          </div>
          <div className="ruban__onglets" role="group" aria-label="Tri">
            {tris.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tri === t.id}
                className={`ruban__onglet${tri === t.id ? " is-actif" : ""}`}
                onClick={() => {
                  setTri(t.id);
                  setCle((c) => c + 1);
                }}
              >
                {t.libelle}
              </button>
            ))}
          </div>
        </header>

        {s.isError && <p className="message">{estErreurApp(s.error) ? s.error.message : String(s.error)}</p>}

        {enPromo > 0 && (
          <div className="souhaits__promo">
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M20 12l-8 8-9-9V3h8z" />
              <circle cx="7.5" cy="7.5" r="1.5" />
            </svg>
            <span>
              <strong>{enPromo}</strong> de tes souhaits {enPromo > 1 ? "sont" : "est"} en promo en ce moment
            </span>
          </div>
        )}

        {s.data && ids.length === 0 && <p className="souhaits__vide">Ta liste de souhaits est vide. Ajoute des jeux depuis Steam.</p>}
        {produits.isLoading && ids.length > 0 && <p className="placeholder-note">Lecture des prix…</p>}

        <div key={cle} className="souhaits__liste">
          {liste.map((p, i) => (
            <Ligne
              key={p.appId}
              p={p}
              index={i}
              ajouteLe={ajoutes.get(p.appId) ?? 0}
              onOuvrir={() => navigate(`/jeu/${p.appId}`)}
              onAcheter={() => setAchat(p)}
            />
          ))}
        </div>
      </div>
      {achat && (
        <PopupAchat
          appId={achat.appId}
          nom={achat.nom}
          prix={achat.prix?.texteFinal ?? (achat.gratuit ? "Gratuit" : "—")}
          obtenir={!achat.prix && achat.gratuit}
          onFermer={() => setAchat(null)}
        />
      )}
    </div>
  );
}

function Ligne({
  p,
  index,
  ajouteLe,
  onOuvrir,
  onAcheter,
}: {
  p: Produit;
  index: number;
  ajouteLe: number;
  onOuvrir: () => void;
  onAcheter: () => void;
}) {
  const [ratee, setRatee] = useState(false);
  const promo = (p.prix?.reduction ?? 0) > 0;
  const image = p.capsule ?? p.banniere;
  return (
    <article className={`souhait${promo ? " is-promo" : ""}`} style={{ animationDelay: `${Math.min(index, 14) * 40}ms` }}>
      <button type="button" className="souhait__image" onClick={onOuvrir} aria-label={`${p.nom} : ouvrir la fiche`} style={image && !ratee ? undefined : { background: degradeJaquette(p.nom) }}>
        {image && !ratee && <img src={viaCache(image)} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setRatee(true)} />}
      </button>
      <div className="souhait__texte">
        <button type="button" className="souhait__nom" onClick={onOuvrir}>
          {p.nom}
        </button>
        <span className="souhait__meta">
          {p.aVenir ? (p.sortieTexte ?? "Prochainement") : p.sortie ? `Sorti le ${date(p.sortie)}` : "Date inconnue"}
          {p.avis && ` · ${p.avis.libelle}`}
        </span>
        <span className="souhait__tags">
          {p.tags.slice(0, 4).join(", ")}
          {ajouteLe > 0 && <span className="souhait__ajout"> · ajouté le {date(ajouteLe)}</span>}
        </span>
      </div>
      <div className="souhait__achat">
        <BlocPrix p={p} grand />
        <button type="button" className={`souhait__acheter${promo ? " is-plein" : ""}`} onClick={onAcheter} disabled={p.aVenir && !p.prix}>
          {p.aVenir && !p.prix ? "Bientôt" : p.prix ? "Acheter" : "Obtenir"}
        </button>
        <button
          type="button"
          className="souhait__retirer"
          aria-label={`Retirer ${p.nom} de la liste (se gère dans Steam)`}
          title="Se gère dans Steam"
          onClick={() => void api.steamLien({ type: "magasin", appId: p.appId })}
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </article>
  );
}
