import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClassements, useEnLigne, useProduits } from "../api/requetes";
import { estErreurApp, type Classe, type Produit, type Releve } from "../api/types";
import { Smoke } from "../components/Smoke";
import { Compteur, Lucioles } from "../components/Vivant";
import { entier } from "../lib/format";
import { viaCache } from "../lib/imageLocale";
import { degradeHero, degradeJaquette } from "../lib/images";
import "./pages.css";
import "./classements.css";

type Onglet = "ventes" | "joues";
const NB_BARRES = 48;

/**
 * Classements (maquette 06) : joueurs en jeu avec la courbe des dernières 24 h,
 * onglets Meilleures ventes / Les plus joués, le n°1 en grand et les suivants en liste.
 */
export function Classements() {
  const navigate = useNavigate();
  const c = useClassements();
  const enLigne = useEnLigne();
  const [onglet, setOnglet] = useState<Onglet>("ventes");
  const [tout, setTout] = useState(false);
  const [cle, setCle] = useState(0);

  const donnees = c.data?.donnees;
  const liste: Classe[] = useMemo(() => {
    const l = onglet === "ventes" ? donnees?.meilleuresVentes : donnees?.plusJoues;
    return (l ?? []).filter((x) => x.appId > 0);
  }, [donnees, onglet]);
  const visibles = tout ? liste : liste.slice(0, 10);
  const produits = useProduits(visibles.map((x) => x.appId));
  const parId = useMemo(() => new Map((produits.data ?? []).map((p) => [p.appId, p])), [produits.data]);

  const changer = (o: Onglet) => {
    setOnglet(o);
    setTout(false);
    setCle((k) => k + 1);
  };

  const premier = visibles[0];
  const p1 = premier ? parId.get(premier.appId) : undefined;

  return (
    <div className="page classements-page">
      {p1?.hero && <div key={p1.appId} className="classements__affiche" aria-hidden="true" style={{ backgroundImage: `url("${viaCache(p1.hero)}")` }} />}
      <Smoke variant="top" />
      <Lucioles graine={61} />
      <div className="page__content classements">
        <header className="classements__entete">
          <h1 className="page__title">Classements</h1>
          <div className="ruban__onglets" role="tablist" aria-label="Classement">
            {(
              [
                ["ventes", "Meilleures ventes"],
                ["joues", "Les plus joués"],
              ] as const
            ).map(([id, libelle]) => (
              <button key={id} type="button" role="tab" aria-selected={onglet === id} className={`ruban__onglet${onglet === id ? " is-actif" : ""}`} onClick={() => changer(id)}>
                {libelle}
              </button>
            ))}
          </div>
        </header>

        <EnJeu donnees={enLigne.data?.donnees} chargement={enLigne.isLoading} />

        {c.isError && <p className="message">{estErreurApp(c.error) ? c.error.message : String(c.error)}</p>}

        {premier && (
          <section key={cle} className="classement" aria-label={onglet === "ventes" ? "Meilleures ventes" : "Les plus joués"}>
            <button type="button" className="classement__un" data-incline="" onClick={() => navigate(`/jeu/${premier.appId}`)} style={{ background: degradeHero(p1?.nom ?? String(premier.appId)) }}>
              {p1?.hero && <img src={viaCache(p1.hero)} alt="" draggable={false} />}
              <span className="classement__voile" aria-hidden="true" />
              <span className="classement__un-texte">
                <span className="classement__chiffre">1</span>
                <span className="classement__un-infos">
                  <span className="kicker">{onglet === "ventes" ? "Meilleure vente de la semaine" : "Le plus joué aujourd’hui"}</span>
                  <span className="classement__un-nom">{p1?.nom ?? "…"}</span>
                  <span className="classement__un-valeur">{valeur(premier, onglet, p1)}</span>
                </span>
              </span>
            </button>

            <div className="classement__liste">
              {visibles.slice(1).map((x, i) => {
                const p = parId.get(x.appId);
                return (
                  <button key={x.appId} type="button" className="classement__ligne" data-lueur="" onClick={() => navigate(`/jeu/${x.appId}`)} style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
                    <span className="classement__rang">{x.rang}</span>
                    <Evolution x={x} />
                    <span className="classement__image" style={p?.banniere ? undefined : { background: degradeJaquette(p?.nom ?? String(x.appId)) }}>
                      {p?.banniere && <img src={viaCache(p.banniere)} alt="" loading="lazy" draggable={false} />}
                    </span>
                    <span className="classement__nom">{p?.nom ?? "…"}</span>
                    <span className="classement__valeur">{valeur(x, onglet, p)}</span>
                  </button>
                );
              })}
              {liste.length > 10 && (
                <button type="button" className="classement__tout" onClick={() => setTout((t) => !t)}>
                  {tout ? "Revenir au top 10" : `Voir le top ${liste.length} →`}
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function valeur(x: Classe, onglet: Onglet, p: Produit | undefined): string {
  if (onglet === "joues") return `${entier(x.valeur)} au pic du jour`;
  const prix = p ? (p.prix ? p.prix.texteFinal : p.gratuit ? "Gratuit" : "") : "";
  const semaines = x.valeur > 1 ? `${x.valeur} semaines au top` : "";
  return [prix, semaines].filter(Boolean).join(" · ");
}

function Evolution({ x }: { x: Classe }) {
  if (!x.rangAvant) return <span className="classement__evo is-nouveau">nouveau</span>;
  const d = x.rangAvant - x.rang;
  if (d === 0) return <span className="classement__evo">=</span>;
  return <span className={`classement__evo ${d > 0 ? "is-monte" : "is-descend"}`}>{d > 0 ? `▲ ${d}` : `▼ ${-d}`}</span>;
}

/** Joueurs en jeu (top 10 des plus joués) et courbe vivante des relevés de l'app sur 24 h. */
function EnJeu({ donnees, chargement }: { donnees: { joueurs: number; releves: Releve[] } | undefined; chargement: boolean }) {
  const valeurs = useMemo(() => {
    const maintenant = Date.now() / 1000;
    const cases: (number | null)[] = Array(NB_BARRES).fill(null);
    for (const r of donnees?.releves ?? []) {
      const i = NB_BARRES - 1 - Math.floor((maintenant - r.le) / 1800);
      if (i >= 0 && i < NB_BARRES) cases[i] = Math.max(cases[i] ?? 0, r.joueurs);
    }
    return cases;
  }, [donnees]);
  const releves = donnees?.releves ?? [];
  const presents = valeurs.filter((v): v is number => v != null);
  const maxi = Math.max(1, ...presents);
  const min = Math.min(maxi, ...presents);
  const derniere = valeurs.reduce<number>((m, v, i) => (v != null ? i : m), -1);
  const pic = releves.length ? Math.max(...releves.map((r) => r.joueurs)) : null;
  const moyenne = releves.length ? Math.round(releves.reduce((s, r) => s + r.joueurs, 0) / releves.length) : null;
  const avant = releves.length >= 2 ? releves[releves.length - 2].joueurs : null;
  const tendance = avant != null && donnees ? donnees.joueurs - avant : null;
  return (
    <section className="en-jeu" data-lueur="" aria-label="Joueurs en jeu">
      <div className="en-jeu__texte">
        <span className="en-jeu__titre">
          <span className="en-jeu__direct">
            <span className="en-jeu__point" />
            En direct
          </span>
          En jeu maintenant
        </span>
        <span className="en-jeu__nombre">{donnees ? <Compteur valeur={donnees.joueurs} duree={1600} /> : chargement ? "…" : "—"}</span>
        <div className="en-jeu__chiffres">
          {pic != null && (
            <span>
              <strong>{entier(pic)}</strong> pic 24 h
            </span>
          )}
          {moyenne != null && (
            <span>
              <strong>{entier(moyenne)}</strong> moyenne
            </span>
          )}
          {tendance != null && tendance !== 0 && (
            <span className={tendance > 0 ? "is-monte" : "is-descend"}>
              <strong>
                {tendance > 0 ? "▲" : "▼"} {entier(Math.abs(tendance))}
              </strong>{" "}
              depuis le relevé d’avant
            </span>
          )}
        </div>
      </div>
      <div className="en-jeu__barres" aria-hidden="true">
        {valeurs.map((b, i) => (
          <span
            key={i}
            className={`en-jeu__barre${b == null ? " is-vide" : ""}${i === derniere ? " is-dernier" : ""}`}
            style={{ height: b == null ? "10%" : `${28 + ((b - min) / Math.max(1, maxi - min)) * 72}%`, "--i": i } as React.CSSProperties}
          />
        ))}
        <span className="en-jeu__balayage" />
      </div>
      <span className="en-jeu__legende">
        Steam ne publie pas le total : c’est la somme des joueurs en jeu sur les 10 jeux les plus joués. La courbe se remplit au fil des relevés de ResTeaM (toutes les 20 min, quand l’app est ouverte).
      </span>
    </section>
  );
}
