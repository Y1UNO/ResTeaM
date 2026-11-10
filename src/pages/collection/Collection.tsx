import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { api } from "../../api/commandes";
import { useBibliotheque, useImages } from "../../api/requetes";
import type { JeuBibliotheque, Produit } from "../../api/types";
import { Smoke } from "../../components/Smoke";
import { entier, heures } from "../../lib/format";
import { degradeJaquette, imagesDe, replierJaquette } from "../../lib/images";
import { Roulette } from "../roulette/Roulette";
import "../pages.css";
import "./collection.css";

type Onglet = "pile" | "prix";
const euros = (centimes: number) => (centimes / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const jouable = (j: JeuBibliotheque) => j.installation?.etat === "installe" || j.installation?.etat === "miseAJourRequise";

/** Fiches du magasin (prix, avis) de toute la bibliothèque, par paquets de 100. */
function useProduitsBibliotheque(ids: number[]) {
  const paquets = useMemo(() => {
    const l: number[][] = [];
    for (let i = 0; i < ids.length; i += 100) l.push(ids.slice(i, i + 100));
    return l;
  }, [ids]);
  return useQueries({
    queries: paquets.map((p) => ({ queryKey: ["produits", p.join(",")], queryFn: () => api.produitsMagasin(p), staleTime: 30 * 60_000 })),
    combine: (r) => ({
      produits: new Map<number, Produit>(r.flatMap((x) => x.data ?? []).map((p) => [p.appId, p])),
      chargement: r.some((x) => x.isLoading),
    }),
  });
}

/**
 * Ma collection : la pile de la honte (jeux jamais lancés) et le prix par heure
 * (ce que chaque heure de jeu a coûté). Les prix sont ceux du magasin (prix de base).
 */
export function Collection() {
  const [params, setParams] = useSearchParams();
  const onglet: Onglet = params.get("onglet") === "prix" ? "prix" : "pile";
  const biblio = useBibliotheque();
  const jeux = useMemo(() => (biblio.data?.donnees.jeux ?? []).filter((j) => !j.cache), [biblio.data]);
  const ids = useMemo(() => jeux.map((j) => j.appId), [jeux]);
  const { produits, chargement } = useProduitsBibliotheque(ids);

  return (
    <div className="page">
      <Smoke variant="top" />
      <div className="page__content collection">
        <header className="collection__entete">
          <div>
            <h1 className="page__title">Ma collection</h1>
            <p className="collection__sous-titre">Ce qui dort dans ta bibliothèque, et ce que t’a coûté chaque heure de jeu.</p>
          </div>
          <div className="journal__periodes" role="tablist" aria-label="Vue">
            {(
              [
                ["pile", "Pile de la honte"],
                ["prix", "Prix par heure"],
              ] as [Onglet, string][]
            ).map(([o, libelle]) => (
              <button key={o} type="button" role="tab" aria-selected={onglet === o} className={`journal__periode${onglet === o ? " is-actif" : ""}`} onClick={() => setParams(o === "pile" ? {} : { onglet: o })}>
                {libelle}
              </button>
            ))}
          </div>
        </header>
        {onglet === "pile" ? <Pile jeux={jeux} produits={produits} chargement={chargement || biblio.isLoading} /> : <PrixParHeure jeux={jeux} produits={produits} chargement={chargement || biblio.isLoading} />}
      </div>
    </div>
  );
}

// ——— Pile de la honte ———

const CLE_PILE = "resteam.pile.depart";
type Depart = { date: number; ids: number[] };

function Pile({ jeux, produits, chargement }: { jeux: JeuBibliotheque[]; produits: Map<number, Produit>; chargement: boolean }) {
  const navigate = useNavigate();
  const [roue, setRoue] = useState(false);
  const pile = useMemo(() => {
    const l = jeux.filter((j) => j.minutesTotal === 0);
    const note = (j: JeuBibliotheque) => produits.get(j.appId)?.avis?.pourcentage ?? -1;
    return l.sort((a, b) => note(b) - note(a) || a.nom.localeCompare(b.nom, "fr"));
  }, [jeux, produits]);
  const valeur = pile.reduce((s, j) => s + (produits.get(j.appId)?.prix?.initial ?? 0), 0);

  // Point de départ, gardé sur ce PC : le compteur descend quand un jeu sort de la pile.
  const [depart, setDepart] = useState<Depart | null>(null);
  useEffect(() => {
    if (!jeux.length) return;
    try {
      const brut = localStorage.getItem(CLE_PILE);
      if (brut) setDepart(JSON.parse(brut) as Depart);
      else {
        const d = { date: Date.now(), ids: pile.map((j) => j.appId) };
        localStorage.setItem(CLE_PILE, JSON.stringify(d));
        setDepart(d);
      }
    } catch {
      /* rien : pas de compteur */
    }
  }, [jeux.length, pile]);
  const sortis = depart ? depart.ids.filter((id) => jeux.some((j) => j.appId === id && j.minutesTotal > 0)).length : 0;
  const images = useImages(pile.slice(0, 120).map((j) => j.appId));

  return (
    <>
      <section className="collection__chiffres">
        <div className="journal__chiffre collection__gros">
          <strong>{chargement && !pile.length ? "…" : entier(pile.length)}</strong>
          <span>jeux jamais lancés</span>
          {depart && <em>{sortis > 0 ? `${sortis} sorti${sortis > 1 ? "s" : ""} de la pile depuis le ${new Date(depart.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}` : "Lance-en un pour faire descendre le compteur"}</em>}
        </div>
        <div className="journal__chiffre">
          <strong>{valeur ? euros(valeur) : "—"}</strong>
          <span>qui dorment (prix de base du magasin)</span>
        </div>
        <div className="journal__chiffre">
          <strong>{jeux.length ? `${Math.round((pile.length / jeux.length) * 100)} %` : "—"}</strong>
          <span>de ta bibliothèque</span>
        </div>
        <button type="button" className="btn-roulette collection__tirer" disabled={!pile.length} onClick={() => setRoue(true)}>
          Tirer dans la pile
        </button>
      </section>

      {pile.length === 0 && !chargement && <p className="journal__vide">Aucun jeu jamais lancé : ta pile de la honte est vide. Bravo !</p>}
      <ul className="pile">
        {pile.map((j, i) => {
          const p = produits.get(j.appId);
          const im = imagesDe(j.appId, images.data);
          return (
            <li key={j.appId} style={{ animationDelay: `${Math.min(i, 24) * 25}ms` }}>
              <button type="button" className="pile__jeu" onClick={() => navigate(`/jeu/${j.appId}`)} title={j.nom}>
                <span className="pile__jaquette" style={i < 120 ? undefined : { background: degradeJaquette(j.nom) }}>
                  {i < 120 && <img src={im.jaquettePetite ?? undefined} alt="" loading="lazy" draggable={false} onError={(e) => replierJaquette(e.currentTarget)} />}
                  {p?.avis && <span className={`pile__note${p.avis.pourcentage >= 80 ? " is-haute" : ""}`}>{p.avis.pourcentage} %</span>}
                  {jouable(j) && <span className="pile__installe">Installé</span>}
                </span>
                <strong>{j.nom}</strong>
                <span>{p?.avis?.libelle ?? (p?.gratuit ? "Gratuit" : "")}{p?.prix ? ` · ${euros(p.prix.initial)}` : ""}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {roue && <Roulette onFermer={() => setRoue(false)} filtresInitiaux={["jamais"]} />}
    </>
  );
}

// ——— Prix par heure ———

type Ligne = { jeu: JeuBibliotheque; prix: number; parHeure: number };

function PrixParHeure({ jeux, produits, chargement }: { jeux: JeuBibliotheque[]; produits: Map<number, Produit>; chargement: boolean }) {
  const navigate = useNavigate();
  const lignes = useMemo<Ligne[]>(
    () =>
      jeux
        .map((j) => ({ jeu: j, prix: produits.get(j.appId)?.prix?.initial ?? 0 }))
        .filter((l) => l.prix > 0 && l.jeu.minutesTotal >= 60)
        .map((l) => ({ ...l, parHeure: l.prix / (l.jeu.minutesTotal / 60) })),
    [jeux, produits],
  );
  const rentables = [...lignes].sort((a, b) => a.parHeure - b.parHeure).slice(0, 10);
  const couteux = [...lignes].sort((a, b) => b.parHeure - a.parHeure).slice(0, 10);
  const valeurTotale = jeux.reduce((s, j) => s + (produits.get(j.appId)?.prix?.initial ?? 0), 0);
  const valeurJouee = lignes.reduce((s, l) => s + l.prix, 0);
  const heuresJouees = lignes.reduce((s, l) => s + l.jeu.minutesTotal, 0) / 60;
  const gratuits = jeux.filter((j) => produits.get(j.appId)?.gratuit && j.minutesTotal > 0).reduce((s, j) => s + j.minutesTotal, 0);
  const images = useImages([...new Set([...rentables, ...couteux].map((l) => l.jeu.appId))]);

  return (
    <>
      <section className="collection__chiffres">
        <div className="journal__chiffre collection__gros">
          <strong>{heuresJouees ? `${(valeurJouee / 100 / heuresJouees).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €` : "—"}</strong>
          <span>par heure de jeu, en moyenne</span>
        </div>
        <div className="journal__chiffre">
          <strong>{valeurTotale ? euros(valeurTotale) : chargement ? "…" : "—"}</strong>
          <span>valeur de ta bibliothèque</span>
        </div>
        <div className="journal__chiffre">
          <strong>{heures(gratuits)}</strong>
          <span>sur des jeux gratuits</span>
        </div>
      </section>
      <p className="collection__note">Calculé avec le prix de base actuel du magasin et ton temps de jeu Steam (jeux joués au moins 1 h). Ce que tu as vraiment payé (promo, lot, cadeau) peut être plus bas.</p>
      <div className="collection__colonnes">
        <Classement titre="Les plus rentables" lignes={rentables} images={images.data} onOuvrir={(id) => navigate(`/jeu/${id}`)} />
        <Classement titre="Les moins rentables" lignes={couteux} images={images.data} onOuvrir={(id) => navigate(`/jeu/${id}`)} />
      </div>
      {!lignes.length && !chargement && <p className="journal__vide">Pas encore assez de données (prix et temps de jeu) pour calculer.</p>}
    </>
  );
}

/** Couleur selon le prix par heure : vert (rentable) → rouge (cher). */
function teinte(parHeure: number) {
  const e = parHeure / 100;
  if (e < 0.25) return "is-top";
  if (e < 1) return "is-bon";
  if (e < 3) return "is-moyen";
  return "is-cher";
}

function Classement({ titre, lignes, images, onOuvrir }: { titre: string; lignes: Ligne[]; images: Parameters<typeof imagesDe>[1]; onOuvrir: (id: number) => void }) {
  return (
    <section className="carte collection__classement">
      <h2 className="carte__titre">{titre}</h2>
      <ol>
        {lignes.map((l, i) => {
          const im = imagesDe(l.jeu.appId, images);
          return (
            <li key={l.jeu.appId} style={{ animationDelay: `${i * 50}ms` }}>
              <button type="button" onClick={() => onOuvrir(l.jeu.appId)}>
                <span className="journal__rang">{i + 1}</span>
                <img src={im.jaquettePetite ?? undefined} alt="" loading="lazy" draggable={false} onError={(e) => replierJaquette(e.currentTarget)} />
                <span className="collection__jeu">
                  <strong>{l.jeu.nom}</strong>
                  <span>
                    {heures(l.jeu.minutesTotal)} · {euros(l.prix)}
                  </span>
                </span>
                <em className={`collection__parheure ${teinte(l.parHeure)}`}>{(l.parHeure / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 })}/h</em>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
