import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/commandes";
import { useBibliotheque, useImages, useVitrineMagasin } from "../api/requetes";
import { estErreurApp, type OffreMagasin } from "../api/types";
import { HeroBackdrop } from "../components/HeroBackdrop";
import { usePalette } from "../lib/couleurs";
import { degradeJaquette, imagesDe } from "../lib/images";
import { Affiche, Lueurs } from "./accueil/Ambiance";
import { PanneauAmis } from "./accueil/PanneauAmis";
import { PopupAchat } from "./fiche/PopupAchat";
import { useMoletteHorizontale } from "../lib/molette";
import { RechercheMagasin, ResultatsRecherche, Rayons, SouhaitsApercu } from "./magasin/Boutique";
import "./magasin/boutique.css";
import "./pages.css";
import "./accueil/accueil.css";
import "./magasin.css";

type Onglet = "offres" | "ventes" | "nouveautes" | "aVenir";

const FOND_NEUTRE = "radial-gradient(ellipse at 65% 35%, rgba(70,72,84,.55), rgba(40,42,50,.2) 55%, #0E0E10 100%)";

const euros = (centimes: number) => `${Math.floor(centimes / 100)},${String(centimes % 100).padStart(2, "0")} €`;

function finOffre(secondes: number | null): string | null {
  if (!secondes) return null;
  const reste = secondes - Date.now() / 1000;
  if (reste <= 0) return null;
  const jours = Math.floor(reste / 86400);
  if (jours >= 1) return `encore ${jours} jour${jours > 1 ? "s" : ""}`;
  const h = Math.max(1, Math.floor(reste / 3600));
  return `encore ${h} h`;
}

/**
 * Magasin (onglet Magasin de la maquette 01) : la vedette affiche le prix et la
 * réduction, « Acheter sur Steam » ouvre le popup de sécurité, et le ruban
 * présente les offres, les meilleures ventes ou les nouveautés.
 */
export function Magasin() {
  const navigate = useNavigate();
  const vitrine = useVitrineMagasin();
  const biblio = useBibliotheque();
  const v = vitrine.data?.donnees;
  const possedes = useMemo(() => new Set((biblio.data?.donnees.jeux ?? []).map((j) => j.appId)), [biblio.data]);

  const [onglet, setOnglet] = useState<Onglet>("offres");
  const liste = useMemo(() => {
    const brute =
      onglet === "offres" ? v?.offres : onglet === "ventes" ? v?.meilleuresVentes : onglet === "aVenir" ? v?.aVenir : v?.nouveautes;
    return brute ?? [];
  }, [v, onglet]);
  const [choisi, setChoisi] = useState(0);
  useEffect(() => setChoisi(0), [onglet]);

  const images = useImages(liste.map((o) => o.appId));
  const vedette = liste[choisi] ?? liste[0];
  const im = vedette ? imagesDe(vedette.appId, images.data) : null;
  const palette = usePalette(im?.hero ?? null, vedette?.nom ?? "Magasin");
  const [achat, setAchat] = useState<OffreMagasin | null>(null);

  const onglets: { id: Onglet; libelle: string }[] = [
    { id: "offres", libelle: "Offres" },
    { id: "ventes", libelle: "Meilleures ventes" },
    { id: "nouveautes", libelle: "Nouveautés" },
    { id: "aVenir", libelle: "À venir" },
  ];
  const [rechercheTout, setRechercheTout] = useState<string | null>(null);
  const boutique = useRef<HTMLDivElement>(null);
  const piste = useRef<HTMLDivElement>(null);
  useMoletteHorizontale(piste, onglet);
  const voirResultats = (terme: string) => {
    setRechercheTout(terme);
    window.setTimeout(() => boutique.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  return (
    <div className="accueil magasin">
      {vedette && <Lueurs palette={palette} />}

      <div className="magasin__recherche">
        <RechercheMagasin onTout={voirResultats} />
      </div>

      {vedette && im ? (
        <section aria-label="Jeu en vedette du magasin" className="hero">
          <Affiche url={im.hero} appId={vedette.appId} />
          <div className="hero__voile" aria-hidden="true" />
          <div className="hero__content">
            <div key={`t-${vedette.appId}`} className="hero__text">
              <span className="kicker">
                <span className="kicker__dot" />
                {possedes.has(vedette.appId)
                  ? "Déjà dans ta bibliothèque"
                  : onglet === "offres"
                    ? "Offre du moment"
                    : onglet === "ventes"
                      ? "Meilleure vente"
                      : "Nouveauté"}
              </span>
              <h1 className={`hero__title${vedette.nom.length > 22 ? " hero__title--long" : ""}`}>{vedette.nom}</h1>

              <div className="hero__chiffres">
                <div className="carte-verre hero__puce">
                  <span className="hero__puce-grand">
                    {vedette.prixFinal > 0 ? euros(vedette.prixFinal) : onglet === "aVenir" ? "Bientôt" : "Gratuit"}
                  </span>
                  <span className="hero__puce-petit">
                    {vedette.reduction > 0
                      ? `au lieu de ${euros(vedette.prixInitial)}`
                      : onglet === "aVenir"
                        ? "pas encore sorti"
                        : "prix sur Steam"}
                  </span>
                </div>
                {vedette.reduction > 0 && (
                  <div className="carte-verre hero__puce">
                    <span className="hero__puce-grand">−{vedette.reduction} %</span>
                    <span className="hero__puce-petit">{finOffre(vedette.finOffre) ?? "offre en cours"}</span>
                  </div>
                )}
              </div>

              <div className="hero__boutons">
                <button
                  type="button"
                  className="btn btn--principal"
                  onClick={() =>
                    possedes.has(vedette.appId) ? void api.steamLien({ type: "magasin", appId: vedette.appId }) : setAchat(vedette)
                  }
                >
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
                  </svg>
                  {possedes.has(vedette.appId) ? "Voir dans Steam" : "Acheter sur Steam"}
                </button>
                <button type="button" className="btn btn--secondaire" onClick={() => navigate(`/jeu/${vedette.appId}`)}>
                  Fiche du jeu
                </button>
              </div>
            </div>

            <button
              key={`c-${vedette.appId}`}
              type="button"
              className="jaquette-hero cvA"
              onClick={() => navigate(`/jeu/${vedette.appId}`)}
              aria-label={`${vedette.nom} : ouvrir la fiche`}
              style={{ background: im.jaquette ? undefined : degradeJaquette(vedette.nom) }}
            >
              {im.jaquette && <img className="jaquette-hero__image" src={im.jaquette} alt="" draggable={false} />}
              <span className="jaquette-hero__voile" aria-hidden="true" />
              {vedette.reduction > 0 && (
                <span className="jaquette-hero__badge">
                  <span className="jaquette-hero__point" />−{vedette.reduction} %
                </span>
              )}
              <span className="jaquette-hero__indice">Ouvrir la fiche</span>
            </button>
          </div>
        </section>
      ) : (
        <section className="hero" aria-busy={vitrine.isLoading}>
          <HeroBackdrop image={null} repli={FOND_NEUTRE} />
          <div className="hero__content">
            <div className="hero__text">
              <span className="kicker">
                <span className="kicker__dot" />
                {vitrine.isLoading ? "Chargement du magasin…" : "Magasin"}
              </span>
              <h1 className="hero__title">Magasin</h1>
              {vitrine.isError && (
                <>
                  <p className="message">{estErreurApp(vitrine.error) ? vitrine.error.message : String(vitrine.error)}</p>
                  <div className="hero__boutons">
                    <button type="button" className="btn btn--secondaire" onClick={() => void vitrine.refetch()}>
                      Réessayer
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      <section aria-labelledby="ruban-magasin" className="ruban">
        <div className="ruban__entete">
          <h2 id="ruban-magasin" className="ruban__titre">
            {onglet === "offres"
              ? "Les offres du moment"
              : onglet === "ventes"
                ? "Les plus vendus"
                : onglet === "aVenir"
                  ? "Bientôt disponibles"
                  : "Tout juste sortis"}
            {vitrine.data?.horsLigne && <span className="placeholder-note"> · hors ligne</span>}
          </h2>
          <div className="ruban__onglets" role="tablist" aria-label="Rayons du magasin">
            {onglets.map((o) => (
              <button
                key={o.id}
                type="button"
                role="tab"
                aria-selected={onglet === o.id}
                className={`ruban__onglet${onglet === o.id ? " is-actif" : ""}`}
                onClick={() => setOnglet(o.id)}
              >
                {o.libelle}
              </button>
            ))}
          </div>
        </div>
        <div key={onglet} ref={piste} className="ruban__piste">
          {v && liste.length === 0 && <p className="ruban__vide">Rien dans ce rayon pour l’instant.</p>}
          {liste.map((o, i) => (
            <CarteOffre
              key={o.appId}
              offre={o}
              jaquette={imagesDe(o.appId, images.data).jaquette}
              possede={possedes.has(o.appId)}
              choisie={i === choisi}
              aVenir={onglet === "aVenir"}
              onClick={() => setChoisi(i)}
            />
          ))}
        </div>
      </section>

      <div ref={boutique} className="boutique">
        {rechercheTout ? (
          <ResultatsRecherche terme={rechercheTout} onFermer={() => setRechercheTout(null)} />
        ) : (
          <>
            <SouhaitsApercu />
            <Rayons vitrine={v} />
          </>
        )}
      </div>

      <PanneauAmis />

      {achat && (
        <PopupAchat
          appId={achat.appId}
          nom={achat.nom}
          prix={achat.prixFinal > 0 ? euros(achat.prixFinal) : "Gratuit"}
          obtenir={achat.prixFinal === 0}
          onFermer={() => setAchat(null)}
        />
      )}
    </div>
  );
}

function CarteOffre({
  offre,
  jaquette,
  possede,
  choisie,
  aVenir,
  onClick,
}: {
  offre: OffreMagasin;
  aVenir: boolean;
  jaquette: string | null;
  possede: boolean;
  choisie: boolean;
  onClick: () => void;
}) {
  const [ratee, setRatee] = useState(false);
  const image = jaquette && !ratee;
  return (
    <button
      type="button"
      className={`rib rib--offre${choisie ? " is-choisie" : ""}`}
      onClick={onClick}
      aria-pressed={choisie}
      aria-label={`${offre.nom}, ${offre.prixFinal > 0 ? euros(offre.prixFinal) : "gratuit"}`}
    >
      <div className="rib__art" style={image ? undefined : { background: degradeJaquette(offre.nom) }}>
        {image && <img src={jaquette!} alt="" draggable={false} loading="lazy" onError={() => setRatee(true)} />}
        {possede ? (
          <span className="rib__badge">À toi</span>
        ) : (
          offre.reduction > 0 && <span className="rib__badge rib__badge--promo">−{offre.reduction} %</span>
        )}
      </div>
      <span className="rib__prix">
        {offre.reduction > 0 && <s>{euros(offre.prixInitial)}</s>}
        <strong>{offre.prixFinal > 0 ? euros(offre.prixFinal) : aVenir ? "Bientôt" : "Gratuit"}</strong>
      </span>
    </button>
  );
}
