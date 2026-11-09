import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { adresseCapture, api } from "../../api/commandes";
import { useBibliotheque, useFilAmis, useImages, useMesCaptures, useModsJeu, useVitrineWorkshop, useWorkshopInstalle } from "../../api/requetes";
import { estErreurApp, type ActiviteAmi, type Capture, type GenreWorkshop, type ObjetWorkshop, type TriWorkshop } from "../../api/types";
import { AvatarSteam } from "../../components/AvatarSteam";
import { Smoke } from "../../components/Smoke";
import { Lucioles } from "../../components/Vivant";
import { date, entier, heures, ilYA, taille } from "../../lib/format";
import { degradeJaquette, imagesDe } from "../../lib/images";
import { viaCache } from "../../lib/imageLocale";
import "../pages.css";
import "./communaute.css";

type Onglet = "fil" | "workshop" | "captures" | "creations";
const ONGLETS: [Onglet, string][] = [
  ["fil", "Fil des amis"],
  ["workshop", "Workshop"],
  ["captures", "Mes captures"],
  ["creations", "Créations"],
];

/**
 * Communauté : ce que font les amis, le Workshop (mes mods et la vitrine d'un jeu),
 * mes captures d'écran et les créations de la communauté (illustrations, guides…).
 * Onglet et jeu sont dans l'adresse (`?onglet=workshop&jeu=431960`), pour y venir
 * depuis la fiche d'un jeu.
 */
export function Communaute() {
  const [params, setParams] = useSearchParams();
  const onglet = (ONGLETS.some(([id]) => id === params.get("onglet")) ? params.get("onglet") : "fil") as Onglet;
  const jeuParam = Number(params.get("jeu")) || null;
  const changer = (o: Onglet, jeu: number | null = jeuParam) => {
    const p = new URLSearchParams();
    p.set("onglet", o);
    if (jeu) p.set("jeu", String(jeu));
    setParams(p, { replace: true });
  };

  return (
    <div className="page communaute-page">
      <Smoke variant="top" />
      <Lucioles graine={83} />
      <div className="page__content communaute">
        <header className="communaute__entete">
          <div>
            <h1 className="page__title">Communauté</h1>
            <p className="communaute__sous-titre">Tes amis, tes mods, tes captures et les créations des joueurs.</p>
          </div>
          <div className="ruban__onglets" role="tablist" aria-label="Communauté">
            {ONGLETS.map(([id, libelle]) => (
              <button key={id} type="button" role="tab" aria-selected={onglet === id} className={`ruban__onglet${onglet === id ? " is-actif" : ""}`} onClick={() => changer(id)}>
                {libelle}
              </button>
            ))}
          </div>
        </header>

        <div key={onglet} className="communaute__corps">
          {onglet === "fil" && <Fil />}
          {onglet === "workshop" && <Workshop jeu={jeuParam} choisir={(j) => changer("workshop", j)} />}
          {onglet === "captures" && <Captures />}
          {onglet === "creations" && <Creations jeu={jeuParam} choisir={(j) => changer("creations", j)} />}
        </div>
      </div>
    </div>
  );
}

function Erreur({ erreur }: { erreur: unknown }) {
  return <p className="message">{estErreurApp(erreur) ? erreur.message : String(erreur)}</p>;
}

function useNoms() {
  const b = useBibliotheque();
  return useMemo(() => new Map((b.data?.donnees.jeux ?? []).map((j) => [j.appId, j.nom])), [b.data]);
}

// ——— Fil des amis ———

function Fil() {
  const navigate = useNavigate();
  const fil = useFilAmis();
  const amis = fil.data ?? [];
  const enJeu = amis.filter((a) => a.joueur.jeuEnCours);
  const ids = useMemo(() => {
    const s = new Set<number>();
    for (const a of amis) {
      if (a.joueur.jeuEnCoursId) s.add(Number(a.joueur.jeuEnCoursId));
      for (const r of a.recents) s.add(r.appId);
    }
    return [...s];
  }, [amis]);
  const images = useImages(ids).data;

  // Jeux du moment chez les amis : combien d'amis, combien d'heures.
  const tendances = useMemo(() => {
    const m = new Map<number, { appId: number; nom: string; minutes: number; amis: ActiviteAmi[] }>();
    for (const a of amis)
      for (const r of a.recents) {
        const t = m.get(r.appId) ?? { appId: r.appId, nom: r.nom, minutes: 0, amis: [] };
        t.minutes += r.minutesDeuxSemaines;
        t.amis.push(a);
        m.set(r.appId, t);
      }
    return [...m.values()].sort((a, b) => b.amis.length - a.amis.length || b.minutes - a.minutes).slice(0, 6);
  }, [amis]);

  // Activité : chaque jeu récent de chaque ami, le plus joué d'abord.
  const activite = useMemo(
    () =>
      amis
        .flatMap((a) => a.recents.slice(0, 3).map((r) => ({ ami: a, jeu: r })))
        .filter((x) => x.jeu.minutesDeuxSemaines > 0)
        .sort((x, y) => y.jeu.minutesDeuxSemaines - x.jeu.minutesDeuxSemaines)
        .slice(0, 30),
    [amis],
  );

  if (fil.isError) return <Erreur erreur={fil.error} />;
  if (fil.isLoading) return <p className="communaute__vide">On regarde ce que font tes amis…</p>;
  if (!amis.length) return <p className="communaute__vide">Aucun ami à afficher (liste d’amis privée ou vide).</p>;

  return (
    <>
      <section className="com-section">
        <h2 className="com-section__titre">
          <span className="com-direct" aria-hidden="true" /> En jeu maintenant <span className="com-section__nombre">{enJeu.length}</span>
        </h2>
        {enJeu.length === 0 ? (
          <p className="communaute__vide">Personne ne joue pour l’instant.</p>
        ) : (
          <div className="com-enjeu">
            {enJeu.map((a, i) => {
              const id = Number(a.joueur.jeuEnCoursId) || null;
              const img = id ? imagesDe(id, images).hero : null;
              return (
                <button
                  key={a.joueur.steamId}
                  type="button"
                  className="com-enjeu__carte"
                  data-incline=""
                  style={{ animationDelay: `${i * 70}ms`, background: degradeJaquette(a.joueur.jeuEnCours ?? "") }}
                  onClick={() => navigate(`/profil/${a.joueur.steamId}`)}
                >
                  {img && <img className="com-enjeu__fond" src={img} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />}
                  <span className="com-enjeu__voile" aria-hidden="true" />
                  <span className="com-enjeu__ami">
                    <span className="com-avatar">
                      <AvatarSteam steamId={a.joueur.steamId} avatar={a.joueur.avatar} />
                    </span>
                    <span>
                      <strong>{a.joueur.pseudo}</strong>
                      <span className="com-enjeu__jeu">{a.joueur.jeuEnCours}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {tendances.length > 0 && (
        <section className="com-section">
          <h2 className="com-section__titre">Les jeux du moment chez tes amis</h2>
          <div className="com-tendances">
            {tendances.map((t, i) => (
              <button key={t.appId} type="button" className="com-tendance" data-incline="" style={{ animationDelay: `${i * 60}ms`, background: degradeJaquette(t.nom) }} onClick={() => navigate(`/jeu/${t.appId}`)}>
                <img src={imagesDe(t.appId, images).banniere ?? ""} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />
                <span className="com-tendance__infos">
                  <strong>{t.nom}</strong>
                  <span>
                    {t.amis.length} ami{t.amis.length > 1 ? "s" : ""} · {heures(t.minutes)} ces 2 semaines
                  </span>
                </span>
                <span className="com-tendance__avatars" aria-hidden="true">
                  {t.amis.slice(0, 4).map((a) => (
                    <span key={a.joueur.steamId} className="com-avatar is-petit">
                      <AvatarSteam steamId={a.joueur.steamId} avatar={a.joueur.avatar} />
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {activite.length > 0 && (
        <section className="com-section">
          <h2 className="com-section__titre">Ces deux dernières semaines</h2>
          <ul className="com-activite">
            {activite.map(({ ami, jeu }, i) => (
              <li key={`${ami.joueur.steamId}-${jeu.appId}`} style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
                <button type="button" className="com-activite__ami" onClick={() => navigate(`/profil/${ami.joueur.steamId}`)}>
                  <span className="com-avatar">
                    <AvatarSteam steamId={ami.joueur.steamId} avatar={ami.joueur.avatar} />
                  </span>
                </button>
                <p>
                  <strong>{ami.joueur.pseudo}</strong> a joué <strong>{heures(jeu.minutesDeuxSemaines)}</strong> à{" "}
                  <button type="button" className="com-lien" onClick={() => navigate(`/jeu/${jeu.appId}`)}>
                    {jeu.nom}
                  </button>
                  <span className="com-activite__quand">{jeu.dernierLancement ? ilYA(jeu.dernierLancement) : "ces 2 semaines"}</span>
                </p>
                <button type="button" className="com-activite__jeu" onClick={() => navigate(`/jeu/${jeu.appId}`)} style={{ background: degradeJaquette(jeu.nom) }}>
                  <img src={imagesDe(jeu.appId, images).banniere ?? ""} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// ——— Choix du jeu (Workshop et Créations) ———

function ChoixJeu({ jeu, choisir, avecMods }: { jeu: number | null; choisir: (j: number) => void; avecMods: boolean }) {
  const installes = useWorkshopInstalle();
  const biblio = useBibliotheque();
  const noms = useNoms();
  const [recherche, setRecherche] = useState("");
  const recents = useMemo(
    () =>
      [...(biblio.data?.donnees.jeux ?? [])]
        .filter((j) => j.dernierLancement > 0)
        .sort((a, b) => b.dernierLancement - a.dernierLancement)
        .slice(0, 8)
        .map((j) => j.appId),
    [biblio.data],
  );
  const avecWs = (installes.data ?? []).map((w) => w.appId);
  const proposes = [...new Set([...(avecMods ? avecWs : []), ...recents, ...(avecMods ? [] : avecWs)])];
  if (jeu && !proposes.includes(jeu)) proposes.unshift(jeu);
  const trouves = recherche.trim().length > 1 ? (biblio.data?.donnees.jeux ?? []).filter((j) => j.nom.toLowerCase().includes(recherche.trim().toLowerCase())).slice(0, 6) : [];

  // Premier passage : le premier jeu proposé.
  useEffect(() => {
    if (!jeu && proposes[0]) choisir(proposes[0]);
  }, [jeu, proposes[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="com-jeux">
      <div className="com-jeux__liste" role="listbox" aria-label="Jeu">
        {proposes.map((id) => {
          const ws = installes.data?.find((w) => w.appId === id);
          return (
            <button key={id} type="button" role="option" aria-selected={jeu === id} className={`com-jeu${jeu === id ? " is-actif" : ""}`} onClick={() => choisir(id)}>
              <img src={imagesDe(id).banniere ?? ""} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
              <span>
                {noms.get(id) ?? `Jeu ${id}`}
                {avecMods && ws && <em>{ws.nombre} mods</em>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="com-jeux__chercher">
        <label className="champ champ--petit">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Un autre jeu de ta bibliothèque…" aria-label="Chercher un jeu" />
        </label>
        {trouves.length > 0 && (
          <div className="com-jeux__trouves">
            {trouves.map((j) => (
              <button
                key={j.appId}
                type="button"
                onClick={() => {
                  choisir(j.appId);
                  setRecherche("");
                }}
              >
                {j.nom}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ——— Workshop ———

function Workshop({ jeu, choisir }: { jeu: number | null; choisir: (j: number) => void }) {
  const installes = useWorkshopInstalle();
  const ws = installes.data?.find((w) => w.appId === jeu);
  const [vue, setVue] = useState<"mes" | "decouvrir">("mes");
  useEffect(() => setVue(ws ? "mes" : "decouvrir"), [jeu, !!ws]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <ChoixJeu jeu={jeu} choisir={choisir} avecMods />
      {installes.isError && <Erreur erreur={installes.error} />}
      {jeu && (
        <>
          <div className="com-barre">
            <div className="ruban__onglets" role="tablist" aria-label="Workshop">
              <button type="button" role="tab" aria-selected={vue === "mes"} className={`ruban__onglet${vue === "mes" ? " is-actif" : ""}`} onClick={() => setVue("mes")}>
                Mes mods{ws ? ` · ${entier(ws.nombre)}` : ""}
              </button>
              <button type="button" role="tab" aria-selected={vue === "decouvrir"} className={`ruban__onglet${vue === "decouvrir" ? " is-actif" : ""}`} onClick={() => setVue("decouvrir")}>
                Découvrir
              </button>
            </div>
            {ws && vue === "mes" && (
              <span className="com-barre__infos">
                {taille(ws.taille)} sur le disque{ws.majEnAttente > 0 && <em> · {ws.majEnAttente} mise{ws.majEnAttente > 1 ? "s" : ""} à jour en attente</em>}
              </span>
            )}
            <Discussions appId={jeu} />
          </div>
          {vue === "mes" ? <MesMods appId={jeu} /> : <Vitrine appId={jeu} genre="objets" />}
        </>
      )}
    </>
  );
}

function Discussions({ appId }: { appId: number }) {
  return (
    <button type="button" className="btn btn--secondaire btn--petit com-barre__discussions" onClick={() => void api.steamLien({ type: "page", url: `https://steamcommunity.com/app/${appId}/discussions/` })}>
      Discussions du jeu
    </button>
  );
}

function MesMods({ appId }: { appId: number }) {
  const mods = useModsJeu(appId);
  const [ouvert, setOuvert] = useState<ObjetWorkshop | null>(null);
  const liste = mods.data?.pages.flatMap((p) => p.mods) ?? [];
  if (mods.isError) return <Erreur erreur={mods.error} />;
  if (mods.isLoading) return <GrilleAttente />;
  if (!liste.length)
    return <p className="communaute__vide">Aucun mod installé pour ce jeu. Va dans « Découvrir » pour en trouver.</p>;
  return (
    <>
      <div className="com-grille">
        {liste.map((m, i) => (
          <CarteObjet
            key={m.id}
            index={i}
            objet={m.objet}
            repli={`Mod ${m.id}`}
            pied={
              <>
                <span>{taille(m.taille)}</span>
                <span>{m.maj ? date(m.maj) : ""}</span>
              </>
            }
            badge={m.aMettreAJour ? "Mise à jour" : null}
            ouvrir={() => (m.objet ? setOuvert(m.objet) : void api.ouvrirObjetWorkshop(m.id, false))}
          />
        ))}
      </div>
      {mods.hasNextPage && (
        <button type="button" className="btn btn--secondaire com-plus" disabled={mods.isFetchingNextPage} onClick={() => void mods.fetchNextPage()}>
          {mods.isFetchingNextPage ? "Chargement…" : "Voir plus de mods"}
        </button>
      )}
      {ouvert && <FenetreObjet objet={ouvert} installe fermer={() => setOuvert(null)} />}
    </>
  );
}

const TRIS: [TriWorkshop, string][] = [
  ["populaires", "Les mieux notés"],
  ["tendance", "Tendance"],
  ["recents", "Récents"],
  ["abonnes", "Les plus suivis"],
];

function Vitrine({ appId, genre }: { appId: number; genre: GenreWorkshop }) {
  const [tri, setTri] = useState<TriWorkshop>("populaires");
  const [saisie, setSaisie] = useState("");
  const [recherche, setRecherche] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setRecherche(saisie.trim()), 450);
    return () => clearTimeout(t);
  }, [saisie]);
  useEffect(() => {
    setSaisie("");
    setRecherche("");
  }, [appId, genre]);
  const v = useVitrineWorkshop(appId, tri, genre, recherche);
  const [ouvert, setOuvert] = useState<ObjetWorkshop | null>(null);
  const liste = v.data?.pages.flatMap((p) => p.donnees.objets) ?? [];
  const total = v.data?.pages[0]?.donnees.total ?? 0;

  return (
    <>
      <div className="com-filtres">
        <div className="com-puces" role="radiogroup" aria-label="Tri">
          {TRIS.map(([id, libelle]) => (
            <button key={id} type="button" role="radio" aria-checked={tri === id} className={`com-puce${tri === id ? " is-actif" : ""}`} disabled={!!recherche} onClick={() => setTri(id)}>
              {libelle}
            </button>
          ))}
        </div>
        <label className="champ champ--petit com-filtres__recherche">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder={genre === "objets" ? "Chercher dans le Workshop…" : "Chercher…"} aria-label="Chercher" />
        </label>
        {total > 0 && <span className="com-barre__infos">{entier(total)} résultats</span>}
      </div>
      {v.isError && <Erreur erreur={v.error} />}
      {v.isLoading ? (
        <GrilleAttente />
      ) : liste.length === 0 && !v.isError ? (
        <p className="communaute__vide">Rien ici pour ce jeu{recherche ? ` avec « ${recherche} »` : ""}.</p>
      ) : (
        <div className={`com-grille${genre === "captures" || genre === "illustrations" ? " is-images" : ""}`}>
          {liste.map((o, i) => (
            <CarteObjet
              key={`${o.id}-${i}`}
              index={i % 30}
              objet={o}
              repli={o.titre}
              pied={
                <>
                  <Note note={o.note} />
                  <span>{entier(o.abonnes || o.vues)} {o.abonnes ? "abonnés" : "vues"}</span>
                </>
              }
              badge={o.video ? "Vidéo" : null}
              ouvrir={() => setOuvert(o)}
            />
          ))}
        </div>
      )}
      {v.hasNextPage && (
        <button type="button" className="btn btn--secondaire com-plus" disabled={v.isFetchingNextPage} onClick={() => void v.fetchNextPage()}>
          {v.isFetchingNextPage ? "Chargement…" : "Voir plus"}
        </button>
      )}
      {ouvert && <FenetreObjet objet={ouvert} installe={false} fermer={() => setOuvert(null)} />}
    </>
  );
}

function GrilleAttente() {
  return (
    <div className="com-grille" aria-busy="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="com-carte is-attente" />
      ))}
    </div>
  );
}

function Note({ note }: { note: number | null }) {
  if (note == null) return <span />;
  return (
    <span className="com-note" title={`${Math.round(note * 100)} % d’avis positifs`}>
      <span className="com-note__barre">
        <span style={{ transform: `scaleX(${Math.max(0.04, note)})` }} />
      </span>
      {Math.round(note * 100)} %
    </span>
  );
}

function CarteObjet({
  objet,
  repli,
  pied,
  badge,
  index,
  ouvrir,
}: {
  objet: ObjetWorkshop | null;
  repli: string;
  pied: React.ReactNode;
  badge: string | null;
  index: number;
  ouvrir: () => void;
}) {
  const titre = objet?.titre || repli;
  const [casse, setCasse] = useState(false);
  return (
    <button type="button" className="com-carte" data-incline="" style={{ animationDelay: `${Math.min(index, 16) * 35}ms` }} onClick={ouvrir}>
      <span className="com-carte__image" style={{ background: degradeJaquette(titre) }}>
        {objet?.apercu && !casse && <img src={viaCache(objet.apercu)} alt="" loading="lazy" draggable={false} onError={() => setCasse(true)} />}
        {badge && <span className="com-carte__badge">{badge}</span>}
      </span>
      <span className="com-carte__titre">{titre || "Sans titre"}</span>
      <span className="com-carte__pied">{pied}</span>
    </button>
  );
}

function FenetreObjet({ objet, installe, fermer }: { objet: ObjetWorkshop; installe: boolean; fermer: () => void }) {
  useEffect(() => {
    const touche = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [fermer]);
  return (
    <>
      <div className="com-voile" onClick={fermer} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label={objet.titre} className="com-fenetre">
        <div className="com-fenetre__image" style={{ background: degradeJaquette(objet.titre) }}>
          {objet.apercu && <img src={viaCache(objet.apercu)} alt="" draggable={false} />}
          {objet.video && <span className="com-fenetre__lecture" aria-hidden="true">▶</span>}
        </div>
        <div className="com-fenetre__texte">
          <h2>{objet.titre || "Sans titre"}</h2>
          {objet.tags.length > 0 && (
            <div className="com-tags">
              {objet.tags.slice(0, 8).map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          )}
          {objet.description && <p className="com-fenetre__description">{objet.description}</p>}
          <dl className="com-chiffres">
            {objet.note != null && (
              <div>
                <dt>Avis</dt>
                <dd>
                  <Note note={objet.note} />
                </dd>
              </div>
            )}
            {objet.abonnes > 0 && (
              <div>
                <dt>Abonnés</dt>
                <dd>{entier(objet.abonnes)}</dd>
              </div>
            )}
            {objet.favoris > 0 && (
              <div>
                <dt>Favoris</dt>
                <dd>{entier(objet.favoris)}</dd>
              </div>
            )}
            {objet.taille > 0 && (
              <div>
                <dt>Taille</dt>
                <dd>{taille(objet.taille)}</dd>
              </div>
            )}
            {objet.maj > 0 && (
              <div>
                <dt>Mis à jour</dt>
                <dd>{date(objet.maj)}</dd>
              </div>
            )}
          </dl>
          <div className="com-fenetre__boutons">
            <button type="button" className="btn btn--principal btn--petit" onClick={() => void api.ouvrirObjetWorkshop(objet.id, true)}>
              {installe ? "Gérer dans Steam" : objet.video ? "Regarder dans Steam" : "S’abonner dans Steam"}
            </button>
            <button type="button" className="btn btn--secondaire btn--petit" onClick={() => void api.ouvrirObjetWorkshop(objet.id, false)}>
              Ouvrir dans le navigateur
            </button>
            <button type="button" className="btn btn--lien" onClick={fermer}>
              Fermer
            </button>
          </div>
          <p className="com-fenetre__note">S’abonner se fait dans Steam : Steam n’offre pas d’accès pour le faire depuis une autre app.</p>
        </div>
      </div>
    </>
  );
}

// ——— Mes captures ———

function Captures() {
  const caps = useMesCaptures();
  const noms = useNoms();
  const [vue, setVue] = useState<{ liste: Capture[]; i: number } | null>(null);
  if (caps.isError) return <Erreur erreur={caps.error} />;
  if (caps.isLoading) return <GrilleAttente />;
  const jeux = caps.data ?? [];
  if (!jeux.length) return <p className="communaute__vide">Aucune capture. Dans un jeu, appuie sur F12 pour en prendre une avec Steam.</p>;
  const total = jeux.reduce((s, j) => s + j.captures.length, 0);
  return (
    <>
      <p className="com-barre__infos com-captures__total">
        {total} capture{total > 1 ? "s" : ""} dans {jeux.length} jeu{jeux.length > 1 ? "x" : ""}
      </p>
      {jeux.map((j) => (
        <section key={j.appId} className="com-section">
          <h2 className="com-section__titre">
            {noms.get(j.appId) ?? `Jeu ${j.appId}`} <span className="com-section__nombre">{j.captures.length}</span>
            <button type="button" className="btn btn--lien com-section__action" onClick={() => void api.ouvrirCaptures(j.appId)}>
              Ouvrir le dossier
            </button>
          </h2>
          <div className="com-captures">
            {j.captures.map((c, i) => (
              <button key={c.fichier} type="button" className="com-capture" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }} onClick={() => setVue({ liste: j.captures, i })}>
                <img src={adresseCapture(c.miniature)} alt="" loading="lazy" draggable={false} />
                <span>{date(c.date)}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      {vue && <Visionneuse liste={vue.liste} depart={vue.i} fermer={() => setVue(null)} />}
    </>
  );
}

function Visionneuse({ liste, depart, fermer }: { liste: Capture[]; depart: number; fermer: () => void }) {
  const [i, setI] = useState(depart);
  const c = liste[i];
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
      if (e.key === "ArrowRight") setI((x) => (x + 1) % liste.length);
      if (e.key === "ArrowLeft") setI((x) => (x - 1 + liste.length) % liste.length);
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [fermer, liste.length]);
  return (
    <div className="com-visionneuse" role="dialog" aria-modal="true" aria-label="Capture d’écran" onClick={fermer}>
      <img key={c.fichier} src={adresseCapture(c.fichier)} alt="" draggable={false} onClick={(e) => e.stopPropagation()} />
      <div className="com-visionneuse__barre" onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Précédente" onClick={() => setI((i - 1 + liste.length) % liste.length)}>
          ‹
        </button>
        <span>
          {i + 1} / {liste.length} · {date(c.date)}
          {c.largeur > 0 && ` · ${c.largeur}×${c.hauteur}`}
        </span>
        <button type="button" aria-label="Suivante" onClick={() => setI((i + 1) % liste.length)}>
          ›
        </button>
      </div>
    </div>
  );
}

// ——— Créations de la communauté ———

const GENRES: [GenreWorkshop, string][] = [
  ["illustrations", "Illustrations"],
  ["captures", "Captures"],
  ["videos", "Vidéos"],
  ["guides", "Guides"],
];

function Creations({ jeu, choisir }: { jeu: number | null; choisir: (j: number) => void }) {
  const [genre, setGenre] = useState<GenreWorkshop>("illustrations");
  return (
    <>
      <ChoixJeu jeu={jeu} choisir={choisir} avecMods={false} />
      {jeu && (
        <>
          <div className="com-barre">
            <div className="ruban__onglets" role="tablist" aria-label="Type de création">
              {GENRES.map(([id, libelle]) => (
                <button key={id} type="button" role="tab" aria-selected={genre === id} className={`ruban__onglet${genre === id ? " is-actif" : ""}`} onClick={() => setGenre(id)}>
                  {libelle}
                </button>
              ))}
            </div>
            <Discussions appId={jeu} />
          </div>
          <Vitrine appId={jeu} genre={genre} />
        </>
      )}
    </>
  );
}
