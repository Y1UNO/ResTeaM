import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAmis, useBibliotheque, useImages, useRechercheMagasin } from "../api/requetes";
import { Smoke } from "../components/Smoke";
import { heures } from "../lib/format";
import { viaCache } from "../lib/imageLocale";
import { degradeJaquette, imagesDe } from "../lib/images";
import { BlocPrix } from "./magasin/Boutique";
import "./pages.css";
import "./magasin/boutique.css";
import "./secondaires.css";

/** Sans accents ni majuscules : « pokemon » trouve « Pokémon ». */
const simplifier = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Recherche globale (Ctrl+K, étape 8) : tes jeux, le magasin et tes amis en même temps.
 * Entrée ouvre le premier résultat.
 */
export function Recherche() {
  const navigate = useNavigate();
  const champ = useRef<HTMLInputElement>(null);
  const [saisie, setSaisie] = useState("");
  const [terme, setTerme] = useState("");
  useEffect(() => champ.current?.focus(), []);
  useEffect(() => {
    const t = window.setTimeout(() => setTerme(saisie.trim()), 220);
    return () => window.clearTimeout(t);
  }, [saisie]);

  const biblio = useBibliotheque();
  const amis = useAmis();
  const magasin = useRechercheMagasin(terme);
  const q = simplifier(terme);

  const mesJeux = useMemo(() => {
    if (q.length < 1) return [];
    return (biblio.data?.donnees.jeux ?? [])
      .filter((j) => !j.cache && simplifier(j.nom).includes(q))
      .sort((a, b) => Number(!simplifier(a.nom).startsWith(q)) - Number(!simplifier(b.nom).startsWith(q)) || b.minutesTotal - a.minutesTotal)
      .slice(0, 12);
  }, [biblio.data, q]);
  const images = useImages(mesJeux.map((j) => j.appId));
  const possedes = useMemo(() => new Set((biblio.data?.donnees.jeux ?? []).map((j) => j.appId)), [biblio.data]);
  const duMagasin = (q.length >= 2 ? (magasin.data ?? []) : []).filter((p) => !possedes.has(p.appId)).slice(0, 8);
  const mesAmis = q.length < 1 ? [] : (amis.data?.donnees.amis ?? []).filter((a) => simplifier(a.pseudo).includes(q)).slice(0, 8);

  const premier = () => {
    if (mesJeux[0]) navigate(`/jeu/${mesJeux[0].appId}`);
    else if (duMagasin[0]) navigate(`/jeu/${duMagasin[0].appId}`);
  };
  const rien = q.length >= 2 && !magasin.isFetching && mesJeux.length === 0 && duMagasin.length === 0 && mesAmis.length === 0;

  return (
    <div className="page">
      <Smoke variant="top" />
      <div className="page__content secondaire recherche">
        <label className="recherche__champ">
          <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <span className="sr-only">Rechercher</span>
          <input
            ref={champ}
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && premier()}
            placeholder="Un jeu, un ami, un genre…"
            spellCheck={false}
          />
          {magasin.isFetching && <span className="brecherche__charge" aria-hidden="true" />}
          <kbd>Ctrl K</kbd>
        </label>

        {q.length === 0 && <p className="secondaire__note">Cherche dans ta bibliothèque, le magasin Steam et tes amis en même temps. Entrée ouvre le premier jeu.</p>}
        {rien && (
          <div className="vide">
            <strong>Rien pour « {terme} »</strong>
            <span>Vérifie l’orthographe, ou essaie un mot plus court.</span>
          </div>
        )}

        {mesJeux.length > 0 && (
          <section className="secondaire__bloc" aria-labelledby="r-jeux">
            <h2 id="r-jeux" className="secondaire__titre">
              Dans ta bibliothèque <span className="secondaire__compte">{mesJeux.length}</span>
            </h2>
            <div className="r-jeux">
              {mesJeux.map((j, i) => {
                const url = imagesDe(j.appId, images.data).jaquettePetite;
                return (
                  <button key={j.appId} type="button" className="r-jeu" onClick={() => navigate(`/jeu/${j.appId}`)} style={{ animationDelay: `${i * 30}ms` }}>
                    <span className="r-jeu__art" data-incline="" style={url ? { backgroundImage: `url("${url}")` } : { background: degradeJaquette(j.nom) }} />
                    <strong>{j.nom}</strong>
                    <span>{j.minutesTotal > 0 ? heures(j.minutesTotal) : "Jamais lancé"}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {duMagasin.length > 0 && (
          <section className="secondaire__bloc" aria-labelledby="r-magasin">
            <h2 id="r-magasin" className="secondaire__titre">
              Dans le magasin
            </h2>
            <div className="r-magasin">
              {duMagasin.map((p, i) => (
                <button key={p.appId} type="button" className="brecherche__ligne r-magasin__ligne" onClick={() => navigate(`/jeu/${p.appId}`)} style={{ animationDelay: `${i * 30}ms` }}>
                  <span className="brecherche__image">{p.banniere && <img src={viaCache(p.banniere)} alt="" loading="lazy" draggable={false} />}</span>
                  <span className="brecherche__texte">
                    <strong>{p.nom}</strong>
                    <span>{p.tags.slice(0, 3).join(" · ")}</span>
                  </span>
                  <BlocPrix p={p} />
                </button>
              ))}
            </div>
          </section>
        )}

        {mesAmis.length > 0 && (
          <section className="secondaire__bloc" aria-labelledby="r-amis">
            <h2 id="r-amis" className="secondaire__titre">
              Amis
            </h2>
            <div className="r-amis">
              {mesAmis.map((a) => (
                <button key={a.steamId} type="button" className="r-ami" onClick={() => navigate(`/profil/${a.steamId}`)}>
                  <span className="r-ami__avatar">{a.avatar && <img src={viaCache(a.avatar)} alt="" />}</span>
                  <strong>{a.pseudo}</strong>
                  <span>{a.jeuEnCours ?? (a.etat > 0 ? "En ligne" : "Hors ligne")}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
