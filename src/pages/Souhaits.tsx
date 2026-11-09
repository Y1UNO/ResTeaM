import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/commandes";
import { useProduits, useSouhaits } from "../api/requetes";
import { estErreurApp, type Produit } from "../api/types";
import { Smoke } from "../components/Smoke";
import { Lucioles } from "../components/Vivant";
import { date, entier } from "../lib/format";
import { viaCache } from "../lib/imageLocale";
import { degradeJaquette } from "../lib/images";
import { PopupAchat } from "./fiche/PopupAchat";
import { IconePanier } from "../components/Prix";
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
  const [survol, setSurvol] = useState<number | null>(null);

  const ajoutes = useMemo(() => new Map(souhaits.map((x) => [x.appId, x.ajouteLe])), [souhaits]);
  const liste = useMemo(() => {
    const l = [...(produits.data ?? [])];
    if (tri === "promos") l.sort((a, b) => (b.prix?.reduction ?? 0) - (a.prix?.reduction ?? 0));
    if (tri === "prix") l.sort((a, b) => (a.prix?.final_ ?? (a.gratuit ? 0 : 1e9)) - (b.prix?.final_ ?? (b.gratuit ? 0 : 1e9)));
    return l;
  }, [produits.data, tri]);
  const enPromo = liste.filter((p) => (p.prix?.reduction ?? 0) > 0).length;
  const vedette = liste.find((p) => p.appId === survol) ?? liste[0];

  const tris: { id: Tri; libelle: string }[] = [
    { id: "ordre", libelle: "Mon ordre" },
    { id: "promos", libelle: "Promos d’abord" },
    { id: "prix", libelle: "Prix" },
  ];

  return (
    <div className="page souhaits-page">
      {vedette?.hero && <div key={vedette.appId} className="souhaits__affiche" aria-hidden="true" style={{ backgroundImage: `url("${viaCache(vedette.hero)}")` }} />}
      <Smoke variant="top" />
      <Lucioles graine={41} nombre={12} />
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

        <div className="souhaits__corps">
          <div key={cle} className="souhaits__liste">
            {liste.map((p, i) => (
              <Ligne
                key={p.appId}
                p={p}
                index={i}
                actif={vedette?.appId === p.appId}
                ajouteLe={ajoutes.get(p.appId) ?? 0}
                onSurvol={() => setSurvol(p.appId)}
                onOuvrir={() => navigate(`/jeu/${p.appId}`)}
                onAcheter={() => setAchat(p)}
              />
            ))}
          </div>
          {vedette && (
            <Details
              key={vedette.appId}
              p={vedette}
              ajouteLe={ajoutes.get(vedette.appId) ?? 0}
              onOuvrir={() => navigate(`/jeu/${vedette.appId}`)}
              onAcheter={() => setAchat(vedette)}
            />
          )}
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
  actif,
  ajouteLe,
  onSurvol,
  onOuvrir,
  onAcheter,
}: {
  p: Produit;
  index: number;
  actif: boolean;
  ajouteLe: number;
  onSurvol: () => void;
  onOuvrir: () => void;
  onAcheter: () => void;
}) {
  const [ratee, setRatee] = useState(false);
  const promo = (p.prix?.reduction ?? 0) > 0;
  const image = p.capsule ?? p.banniere;
  return (
    <article
      data-lueur=""
      className={`souhait${promo ? " is-promo" : ""}${actif ? " is-actif" : ""}`}
      style={{ animationDelay: `${Math.min(index, 14) * 40}ms` }}
      onMouseEnter={onSurvol}
      onFocus={onSurvol}
    >
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

/** Panneau de détails du jeu survolé (grands écrans) : captures, tags, avis, prix. */
function Details({ p, ajouteLe, onOuvrir, onAcheter }: { p: Produit; ajouteLe: number; onOuvrir: () => void; onAcheter: () => void }) {
  return (
    <aside className="souhaits__details" aria-label={`Détails de ${p.nom}`}>
      <span className="kicker">
        <span className="kicker__dot" />
        {(p.prix?.reduction ?? 0) > 0 ? "En promo" : p.aVenir ? "Bientôt" : "Dans tes souhaits"}
      </span>
      <h2 className="souhaits__details-nom">{p.nom}</h2>
      {p.avis && (
        <span className="souhaits__details-avis">
          <strong>{p.avis.libelle}</strong> · {entier(p.avis.nombre)} évaluations · {p.avis.pourcentage} %
        </span>
      )}
      <div className="souhaits__details-captures">
        {(p.captures.length ? p.captures : [p.capsule ?? p.banniere]).slice(0, 4).map((c, i) =>
          c ? <img key={c} src={viaCache(c)} alt="" loading="lazy" draggable={false} style={{ animationDelay: `${i * 70}ms` }} /> : null,
        )}
      </div>
      {p.tags.length > 0 && (
        <div className="bapercu__tags">
          {p.tags.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      )}
      <span className="souhaits__details-meta">
        {p.aVenir ? (p.sortieTexte ?? "Prochainement") : p.sortie ? `Sorti le ${date(p.sortie)}` : ""}
        {ajouteLe > 0 && ` · dans tes souhaits depuis le ${date(ajouteLe)}`}
      </span>
      <div className="souhaits__details-bas">
        <BlocPrix p={p} grand />
        <div className="souhaits__details-boutons">
          <button type="button" className="btn btn--secondaire btn--petit" onClick={onOuvrir}>
            Fiche
          </button>
          {!p.aVenir && (
            <button type="button" className="btn btn--principal btn--petit" onClick={onAcheter}>
              <IconePanier />
              Acheter
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
