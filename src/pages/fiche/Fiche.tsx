import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/commandes";
import {
  useAmis,
  useAmisPossedant,
  useAvisJeu,
  useBibliotheque,
  useConfigPc,
  useFicheJeu,
  useFileSteam,
  useImages,
  useJeuxInstalles,
  useNomJeu,
  usePatchNotes,
} from "../../api/requetes";
import { estErreurApp, type ConfigPc, type FicheJeu, type JeuBibliotheque, type LigneConfig } from "../../api/types";
import { Smoke } from "../../components/Smoke";
import { FenetreDesinstallation } from "../../installation/Desinstallation";
import { useInstallation } from "../../installation/store";
import { bilan, comparer } from "../../lib/config";
import { usePalette } from "../../lib/couleurs";
import { date, entier, heures, taille } from "../../lib/format";
import { imagesDe } from "../../lib/images";
import { rangDepuisMinutes } from "../../lib/rangs";
import { viaCache } from "../../lib/imageLocale";
import { Medias } from "./Medias";
import { BadgeRang } from "../../components/BadgeRang";
import { IconWorkshop } from "../../components/icons";
import { IconePanier, MontantDefilant, PrixPromo, Reduction } from "../../components/Prix";
import { PopupAchat } from "./PopupAchat";
import { FenetreProprietes } from "./Proprietes";
import "../pages.css";
import "./fiche.css";

type IdSection = "apropos" | "config" | "avis" | "actus";

/**
 * Fiche d'un jeu (maquette 02) : tags, titre géant, évaluations, un seul bloc
 * d'action (achat, ou Jouer / Installer / Désinstaller si le jeu est à toi),
 * médias, sections dépliables et encadré latéral.
 */
export function Fiche() {
  const { appId: brut } = useParams();
  const appId = Number(brut);
  const valide = Number.isInteger(appId) && appId > 0;
  const navigate = useNavigate();

  const fiche = useFicheJeu(valide ? appId : null);
  const avis = useAvisJeu(valide ? appId : null);
  const biblio = useBibliotheque();
  const installes = useJeuxInstalles();
  const images = useImages(valide ? [appId] : []);
  const im = imagesDe(appId, images.data);
  const f = fiche.data?.donnees;
  const possede = biblio.data?.donnees.jeux.find((j) => j.appId === appId) ?? null;
  const nom = f?.nom ?? possede?.nom ?? "Jeu";
  const palette = usePalette(im.hero, nom);

  const [section, setSection] = useState<IdSection | null>("apropos");
  const [achat, setAchat] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [appId]);

  const style = {
    "--fiche-c1": palette[0],
    "--fiche-c2": palette[1],
  } as CSSProperties;

  const installe = installes.data?.find((i) => i.appId === appId) ?? null;

  return (
    <div className="fiche" style={style}>
      <div className="fiche__fond" aria-hidden="true" />
      {im.hero && <div key={im.hero} className="fiche__affiche" aria-hidden="true" style={{ backgroundImage: `url("${im.hero}")` }} />}
      <div className="fiche__voile" aria-hidden="true" />
      <Smoke variant="hero" className="fiche__fumee" />

      <div className="fiche__contenu">
        <button type="button" className="fiche__retour" onClick={() => navigate(-1)}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Retour
        </button>

        <section className="fiche__haut" aria-labelledby="fiche-titre">
          <div className="fiche__texte">
            {f && f.genres.length > 0 && (
              <div className="fiche__tags">
                {f.genres.slice(0, 4).map((g) => (
                  <span key={g} className="fiche__tag">
                    {g}
                  </span>
                ))}
              </div>
            )}
            <h1 id="fiche-titre" className="fiche__titre">
              {nom}
            </h1>
            <div className="fiche__meta">
              {avis.data?.donnees.global && (
                <span>
                  <strong>{avis.data.donnees.global.libelle}</strong> · {entier(avis.data.donnees.global.nombre)} évaluations
                </span>
              )}
              {f?.sortie && <span>{f.aVenir ? `Sortie prévue : ${f.sortie}` : `Sorti le ${f.sortie}`}</span>}
              {f?.demo && <span>Démo disponible</span>}
            </div>

            {fiche.isError && !f && (
              <p className="message">{estErreurApp(fiche.error) ? fiche.error.message : "Fiche introuvable."}</p>
            )}

            {possede ? (
              <BlocPossede
                jeu={possede}
                installe={installe}
                nom={nom}
                jaquette={im.jaquette}
                hero={im.hero}
                teinte={palette[0]}
              />
            ) : (
              f && <BlocAchat fiche={f} onAcheter={() => setAchat(true)} />
            )}
          </div>

          <div className="fiche__medias">
            {f ? <Medias medias={f.medias} nom={nom} /> : <div className="fiche-medias__grand fiche-medias__grand--vide" aria-busy="true" />}
          </div>
        </section>

        <section className="fiche__bas" aria-label="Détails du jeu">
          <div className="fiche__sections">
            <Section id="apropos" titre="À propos du jeu" indice="description" ouverte={section} onBasculer={setSection}>
              {f ? (
                <>
                  {f.resume && <p className="fiche__resume">{f.resume}</p>}
                  {f.aPropos.slice(0, 6).map((p, i) => (
                    <p key={i} className="fiche__paragraphe">
                      {p}
                    </p>
                  ))}
                  {f.genres.length > 0 && <Rangee cle="Genres" valeur={f.genres.join(", ")} />}
                </>
              ) : (
                <p className="fiche__paragraphe">Chargement…</p>
              )}
            </Section>
            <SectionConfig fiche={f} ouverte={section} onBasculer={setSection} />
            <Section
              id="avis"
              titre="Avis des joueurs"
              indice={avis.data?.donnees.global?.libelle ?? "évaluations"}
              ouverte={section}
              onBasculer={setSection}
            >
              <Avis appId={appId} />
            </Section>
            <SectionActus appId={appId} ouverte={section} onBasculer={setSection} />
          </div>

          <aside className="fiche__encart">
            <Ligne cle="Développeur" valeur={f?.developpeurs.join(", ") || "—"} />
            <Ligne cle="Éditeur" valeur={f?.editeurs.join(", ") || "—"} />
            <Ligne cle="Sortie" valeur={f?.sortie || "—"} />
            <Ligne
              cle="Langues"
              valeur={f ? (f.langues.length > 4 ? `${f.langues.slice(0, 3).join(", ")} et ${f.langues.length - 3} autres` : f.langues.join(", ") || "—") : "—"}
              titre={f?.langues.join(", ")}
            />
            {f?.metacritic != null && <Ligne cle="Metacritic" valeur={`${f.metacritic} / 100`} />}
            <div className="fiche__separateur" />
            <AmisPossedant appId={appId} />
            <button type="button" className="fiche__lien" onClick={() => void api.steamLien({ type: "magasin", appId })}>
              Ouvrir la page dans Steam
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M7 17L17 7M9 7h8v8" />
              </svg>
            </button>
          </aside>
        </section>
      </div>

      {achat && f && (
        <PopupAchat
          appId={f.appId}
          nom={f.nom}
          prix={f.prix?.texteFinal ?? (f.gratuit ? "Gratuit" : "—")}
          obtenir={f.gratuit && !f.prix}
          onFermer={() => setAchat(false)}
        />
      )}
    </div>
  );
}

// ——— Bloc d'action ———

function BlocAchat({ fiche, onAcheter }: { fiche: FicheJeu; onAcheter: () => void }) {
  const p = fiche.prix;
  return (
    <>
      <div className="fiche-bloc">
        <div className="fiche-bloc__prix">
          {p && p.reduction > 0 && <Reduction pourcent={p.reduction} grand />}
          <div className="fiche-bloc__montants">
            {p && p.reduction > 0 ? (
              <span className="fiche-bloc__montant">
                <PrixPromo initial={p.initial} final_={p.final_} grand />
              </span>
            ) : (
              <span className="fiche-bloc__montant">{p ? <MontantDefilant centimes={p.final_} /> : fiche.gratuit ? "Gratuit" : fiche.aVenir ? "Bientôt" : "—"}</span>
            )}
          </div>
        </div>
        <button type="button" className="btn btn--principal fiche-bloc__acheter" onClick={onAcheter} disabled={fiche.aVenir && !p}>
          <IconePanier />
          {fiche.gratuit && !p ? "Obtenir" : "Acheter"}
        </button>
        <button
          type="button"
          className="fiche-bloc__etoile"
          aria-label="Liste de souhaits : se gère dans Steam"
          title="Se gère dans Steam"
          onClick={() => void api.steamLien({ type: "magasin", appId: fiche.appId })}
        >
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
          </svg>
        </button>
      </div>
      <span className="fiche__sous-bloc">Le paiement et la liste de souhaits se font dans Steam.</span>
    </>
  );
}

function BlocPossede({
  jeu,
  installe,
  nom,
  jaquette,
  hero,
  teinte,
}: {
  jeu: JeuBibliotheque;
  installe: { etat: string; taille: number; dossier: string } | null;
  nom: string;
  jaquette: string | null;
  hero: string | null;
  teinte: string;
}) {
  const installation = useInstallation();
  const navigate = useNavigate();
  const file = useFileSteam().data;
  const nomEnCours = useNomJeu(file?.jeuEnCours);
  const [desinstaller, setDesinstaller] = useState(false);
  const [proprietes, setProprietes] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const r = rangDepuisMinutes(jeu.minutesTotal);
  const enCours = installe?.etat === "telechargement" || installe?.etat === "enPause";
  const jouable = !!installe && !enCours;
  const aSupprimer = !!file?.desinstallations.includes(jeu.appId);
  const suivi = { appId: jeu.appId, nom, jaquette, hero };

  const annuler = () => {
    api
      .annulerFileSteam(jeu.appId)
      .then(() => setErreur(null))
      .catch((e) => setErreur(estErreurApp(e) ? e.message : String(e)));
  };

  return (
    <>
      <div className="fiche-bloc">
        <div className="fiche-bloc__possede">
          <span className="kicker">
            <span className="kicker__dot" />
            Dans ta bibliothèque
          </span>
          <span className="fiche-bloc__temps">
            {jeu.minutesTotal > 0 ? heures(jeu.minutesTotal) : "Jamais lancé"}
            {r.niveau > 0 && <BadgeRang niveau={r.niveau} taille={42} />}
          </span>
        </div>
        {aSupprimer ? (
          <button type="button" className="btn btn--secondaire fiche-bloc__acheter" onClick={annuler} disabled={file?.phase === "redemarrage"}>
            Annuler la désinstallation
          </button>
        ) : enCours ? (
          <button type="button" className="btn btn--principal fiche-bloc__acheter" onClick={() => installation.ouvrirSuivi(suivi)}>
            Voir le téléchargement
          </button>
        ) : jouable ? (
          <button type="button" className="btn btn--principal fiche-bloc__acheter" onClick={() => void api.steamLien({ type: "jouer", appId: jeu.appId })}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 4l14 8-14 8z" />
            </svg>
            Jouer
          </button>
        ) : (
          <button type="button" className="btn btn--principal fiche-bloc__acheter" onClick={() => installation.ouvrirChoix(suivi)}>
            Installer
          </button>
        )}
        <button
          type="button"
          className="fiche-bloc__etoile"
          aria-label={`Workshop de ${nom}`}
          title="Workshop et créations du jeu"
          onClick={() => navigate(`/workshop?jeu=${jeu.appId}`)}
        >
          <IconWorkshop size={20} />
        </button>
        <button
          type="button"
          className="fiche-bloc__etoile fiche-bloc__engrenage"
          aria-label={`Propriétés de ${nom}`}
          title="Propriétés"
          onClick={() => setProprietes(true)}
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
              </svg>
        </button>
        {installe && !aSupprimer && (
          <button
            type="button"
            className="fiche-bloc__etoile fiche-bloc__corbeille"
            aria-label={`Désinstaller ${nom}`}
            title="Désinstaller"
            onClick={() => setDesinstaller(true)}
          >
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
            </svg>
          </button>
        )}
      </div>
      <span className="fiche__sous-bloc">
        {aSupprimer
          ? file?.phase === "attenteJeu"
            ? `Désinstallation prévue dès que tu quittes ${nomEnCours ?? "ton jeu"}.`
            : "Désinstallation en cours : Steam redémarre caché…"
          : installe
            ? `${installe.taille > 0 ? `${taille(installe.taille)} · ` : ""}${installe.dossier}`
            : "Pas installé sur ce PC."}
      </span>
      {erreur && <p className="message">{erreur}</p>}
      {proprietes && <FenetreProprietes appId={jeu.appId} nom={nom} jaquette={jaquette} onFermer={() => setProprietes(false)} />}
      {desinstaller && installe && (
        <FenetreDesinstallation
          appId={jeu.appId}
          nom={nom}
          jaquette={jaquette}
          poids={installe.taille}
          dossier={installe.dossier}
          teinte={teinte}
          jeuEnCours={file?.jeuEnCours ?? null}
          onFermer={() => setDesinstaller(false)}
        />
      )}
    </>
  );
}

// ——— Sections dépliables (une seule ouverte) ———

function Section({
  id,
  titre,
  indice,
  ouverte,
  onBasculer,
  children,
}: {
  id: IdSection;
  titre: string;
  indice: ReactNode;
  ouverte: IdSection | null;
  onBasculer: (id: IdSection | null) => void;
  children: ReactNode;
}) {
  const ouvert = ouverte === id;
  return (
    <div data-lueur="" className={`fiche-section${ouvert ? " is-ouverte" : ""}`}>
      <button type="button" className="fiche-section__tete" aria-expanded={ouvert} onClick={() => onBasculer(ouvert ? null : id)}>
        <span className="fiche-section__titres">
          <span className="fiche-section__titre">{titre}</span>
          <span className="fiche-section__indice">{indice}</span>
        </span>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="fiche-section__fleche">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div className="fiche-section__corps">
        <div className="fiche-section__interieur">{ouvert && <div className="fiche-section__contenu">{children}</div>}</div>
      </div>
    </div>
  );
}

function Rangee({ cle, valeur }: { cle: string; valeur: ReactNode }) {
  return (
    <div className="fiche-rangee">
      <span>{cle}</span>
      <span>{valeur}</span>
    </div>
  );
}

function SectionConfig({
  fiche,
  ouverte,
  onBasculer,
}: {
  fiche: FicheJeu | undefined;
  ouverte: IdSection | null;
  onBasculer: (id: IdSection | null) => void;
}) {
  const pc = useConfigPc().data;
  const lignes = fiche?.configMinimale ?? [];
  const verdict = pc && lignes.length ? bilan(lignes, pc) : null;
  const indice =
    verdict === "ok" ? (
      <span className="fiche-verdict is-ok">Ton PC suit</span>
    ) : verdict === "court" ? (
      <span className="fiche-verdict is-court">Ton PC est un peu juste</span>
    ) : (
      "minimum et recommandée"
    );
  return (
    <Section id="config" titre="Configuration requise" indice={indice} ouverte={ouverte} onBasculer={onBasculer}>
      {!fiche ? (
        <p className="fiche__paragraphe">Chargement…</p>
      ) : lignes.length === 0 ? (
        <p className="fiche__paragraphe">Steam n’indique pas de configuration pour ce jeu.</p>
      ) : (
        <TableauConfig minimale={lignes} recommandee={fiche.configRecommandee} pc={pc} />
      )}
    </Section>
  );
}

function TableauConfig({ minimale, recommandee, pc }: { minimale: LigneConfig[]; recommandee: LigneConfig[]; pc: ConfigPc | undefined }) {
  const remarques = minimale.filter((l) => !l.cle);
  const lignes = minimale.filter((l) => l.cle);
  return (
    <>
      <div className="fiche-config" role="table" aria-label="Configuration requise comparée à ton PC">
        <div className="fiche-config__ligne fiche-config__ligne--tete" role="row">
          <span role="columnheader" />
          <span role="columnheader">Minimale</span>
          <span role="columnheader">Recommandée</span>
          <span role="columnheader">Ton PC</span>
        </div>
        {lignes.map((l) => {
          const reco = recommandee.find((x) => x.cle === l.cle);
          const c = pc ? comparer(l, pc) : null;
          return (
            <div key={l.cle} className="fiche-config__ligne" role="row">
              <span role="rowheader">{l.cle}</span>
              <span role="cell">{l.valeur}</span>
              <span role="cell">{reco?.valeur ?? "—"}</span>
              <span role="cell" className={`fiche-config__pc${c ? ` is-${c.verdict}` : ""}`}>
                {c ? (
                  <>
                    <Pastille verdict={c.verdict} />
                    {c.pc}
                  </>
                ) : (
                  "—"
                )}
              </span>
            </div>
          );
        })}
      </div>
      {remarques.map((r) => (
        <p key={r.valeur} className="fiche__note">
          {r.valeur}
        </p>
      ))}
      <p className="fiche__note">Système, mémoire et espace disque sont comparés pour de vrai ; processeur et carte graphique sont donnés à titre indicatif.</p>
    </>
  );
}

function Pastille({ verdict }: { verdict: "ok" | "court" | "indicatif" }) {
  return (
    <span className={`fiche-pastille is-${verdict}`} aria-label={verdict === "ok" ? "suffisant" : verdict === "court" ? "insuffisant" : "indicatif"}>
      {verdict === "ok" ? "✓" : verdict === "court" ? "!" : "~"}
    </span>
  );
}

function Avis({ appId }: { appId: number }) {
  const avis = useAvisJeu(appId);
  const a = avis.data?.donnees;
  if (avis.isLoading) return <p className="fiche__paragraphe">Chargement…</p>;
  if (!a || (!a.global && !a.francais)) return <p className="fiche__paragraphe">Pas encore assez d’évaluations.</p>;
  return (
    <div className="fiche-avis">
      {a.global && <JaugeAvis titre="Toutes langues" r={a.global} />}
      {a.francais && <JaugeAvis titre="En français" r={a.francais} />}
    </div>
  );
}

function JaugeAvis({ titre, r }: { titre: string; r: { libelle: string; pourcentage: number; nombre: number } }) {
  return (
    <div className="fiche-avis__bloc">
      <div className="fiche-avis__ligne">
        <span>{titre}</span>
        <strong>{r.libelle}</strong>
      </div>
      <div className="fiche-avis__barre" aria-hidden="true">
        <span style={{ width: `${r.pourcentage}%` }} />
      </div>
      <div className="fiche-avis__ligne fiche-avis__ligne--petite">
        <span>{r.pourcentage} % positives</span>
        <span>{entier(r.nombre)} évaluations</span>
      </div>
    </div>
  );
}

const LIBELLES: Record<string, string> = {
  nouveau: "Nouveau",
  equilibrage: "Équilibrage",
  performances: "Performances",
  correctifs: "Correctifs",
  autre: "Autre",
};

function SectionActus({ appId, ouverte, onBasculer }: { appId: number; ouverte: IdSection | null; onBasculer: (id: IdSection | null) => void }) {
  const notes = usePatchNotes(appId);
  const n = notes.data?.donnees;
  return (
    <Section id="actus" titre="Actus et patch notes" indice={n ? `${n.titre} · ${date(n.date)}` : "triés automatiquement"} ouverte={ouverte} onBasculer={onBasculer}>
      {notes.isLoading ? (
        <p className="fiche__paragraphe">Chargement…</p>
      ) : !n ? (
        <p className="fiche__paragraphe">Pas d’actus récentes pour ce jeu.</p>
      ) : (
        <>
          <Rangee cle="Dernière annonce" valeur={`${n.titre}${n.version ? ` · ${n.version}` : ""} · ${date(n.date)}`} />
          {n.sections.slice(0, 4).map((s) => (
            <div key={s.categorie} className="fiche-notes">
              <span className={`fiche-notes__tag is-${s.categorie}`}>{LIBELLES[s.categorie] ?? s.categorie}</span>
              <ul>
                {s.elements.slice(0, 3).map((e, i) => (
                  <li key={i}>{e.texte}</li>
                ))}
              </ul>
            </div>
          ))}
          <button type="button" className="fiche__lien" onClick={() => void api.steamLien({ type: "page", url: n.url })}>
            Lire l’annonce complète
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 17L17 7M9 7h8v8" />
            </svg>
          </button>
        </>
      )}
    </Section>
  );
}

function Ligne({ cle, valeur, titre }: { cle: string; valeur: string; titre?: string }) {
  return (
    <div className="fiche__ligne">
      <span>{cle}</span>
      <span title={titre}>{valeur}</span>
    </div>
  );
}

/** « N amis possèdent ce jeu » avec leurs avatars (maquette 02). */
function AmisPossedant({ appId }: { appId: number }) {
  const ids = useAmisPossedant(appId);
  const amis = useAmis();
  if (amis.data?.donnees.prive) return null;
  if (ids.isLoading) return <span className="fiche__amis fiche__amis--charge">Recherche chez tes amis…</span>;
  const liste = (ids.data ?? [])
    .map((id) => amis.data?.donnees.amis.find((a) => a.steamId === id))
    .filter((a): a is NonNullable<typeof a> => !!a);
  if (liste.length === 0) return <span className="fiche__amis">Aucun ami ne possède ce jeu</span>;
  return (
    <div className="fiche__amis" title={liste.map((a) => a.pseudo).join(", ")}>
      <span className="fiche__amis-avatars">
        {liste.slice(0, 5).map((a) => (
          <span key={a.steamId} className="fiche__amis-avatar">
            {a.avatar && <img src={viaCache(a.avatar)} alt="" draggable={false} />}
          </span>
        ))}
      </span>
      <span>
        {liste.length} ami{liste.length > 1 ? "s possèdent" : " possède"} ce jeu
      </span>
    </div>
  );
}
