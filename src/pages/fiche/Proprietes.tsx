import { useEffect, useMemo, useRef, useState } from "react";
import { HistoriqueNotes } from "./HistoriqueNotes";
import { IconCarnet } from "../../components/icons";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/commandes";
import { useDlcJeu, useFileSteam, useNomJeu, useProprietesJeu } from "../../api/requetes";
import { useNavigate } from "react-router-dom";
import { BlocPrix } from "../magasin/Boutique";
import { estErreurApp } from "../../api/types";
import { date, taille } from "../../lib/format";
import { viaCache } from "../../lib/imageLocale";
import "./fiche.css";

type Onglet = "general" | "maj" | "fichiers" | "dlc" | "notes";

/** Options courantes, à ajouter ou retirer d'un clic (elles dépendent du jeu). */
const SUGGESTIONS = ["-novid", "-high", "-fullscreen", "-windowed", "-noborder", "-nojoy", "+fps_max 144", "-dx12", "-vulkan"];

const LANGUES: Record<string, string> = {
  french: "Français",
  english: "Anglais",
  german: "Allemand",
  spanish: "Espagnol",
  italian: "Italien",
  japanese: "Japonais",
  koreana: "Coréen",
  russian: "Russe",
  schinese: "Chinois simplifié",
  tchinese: "Chinois traditionnel",
  brazilian: "Portugais du Brésil",
  polish: "Polonais",
};

const MAJ = [
  { v: 0, titre: "Toujours garder à jour", detail: "Steam installe les mises à jour dès qu’elles sortent." },
  { v: 1, titre: "Seulement au lancement", detail: "La mise à jour se fait quand tu lances le jeu." },
  { v: 2, titre: "En priorité", detail: "Ce jeu passe avant les autres téléchargements." },
];
const ARRIERE_PLAN = [
  { v: 0, titre: "Selon le réglage de Steam", detail: "Le réglage général de Steam s’applique." },
  { v: 1, titre: "Toujours autoriser", detail: "Les autres jeux se mettent à jour pendant que tu joues à celui-ci." },
  { v: 2, titre: "Jamais", detail: "Rien ne se télécharge pendant que tu joues à celui-ci." },
];

/**
 * Propriétés d'un jeu (étape 10), dans la DA : options de lancement, mises à jour,
 * fichiers et DLC. L'écriture se fait Steam fermé : Steam redémarre caché (après le
 * jeu en cours s'il y en a un), comme pour une installation.
 */
export function FenetreProprietes({ appId, nom, jaquette, onFermer }: { appId: number; nom: string; jaquette: string | null; onFermer: () => void }) {
  const client = useQueryClient();
  const p = useProprietesJeu(appId);
  const file = useFileSteam().data;
  const nomEnCours = useNomJeu(file?.jeuEnCours);
  const d = p.data;
  const [onglet, setOnglet] = useState<Onglet>("general");
  const [historique, setHistorique] = useState(false);
  const [options, setOptions] = useState<string | null>(null);
  const [maj, setMaj] = useState<number | null>(null);
  const [arriere, setArriere] = useState<number | null>(null);
  const [envoi, setEnvoi] = useState<"repos" | "envoi" | "fait">("repos");
  const [erreur, setErreur] = useState<string | null>(null);
  const [sortie, setSortie] = useState(false);
  const minuterie = useRef<number | undefined>(undefined);
  const dlc = useDlcJeu(appId);
  const navigate = useNavigate();
  const installes = new Set(d?.dlc ?? []);
  const listeDlc = [...(dlc.data ?? [])].sort((a, b) => Number(installes.has(b.appId)) - Number(installes.has(a.appId)));

  // Valeurs affichées : la demande en attente si elle existe, sinon le fichier de Steam.
  const base = useMemo(
    () => ({
      options: d?.enAttente?.optionsLancement ?? d?.optionsLancement ?? "",
      maj: d?.enAttente?.majAuto ?? d?.majAuto ?? 0,
      arriere: d?.enAttente?.telechargementsEnJeu ?? d?.telechargementsEnJeu ?? 0,
    }),
    [d],
  );
  const vOptions = options ?? base.options;
  const vMaj = maj ?? base.maj;
  const vArriere = arriere ?? base.arriere;
  const change = vOptions.trim() !== base.options.trim() || vMaj !== base.maj || vArriere !== base.arriere;

  const fermer = () => {
    setSortie(true);
    window.clearTimeout(minuterie.current);
    minuterie.current = window.setTimeout(onFermer, 380);
  };
  useEffect(() => () => window.clearTimeout(minuterie.current), []);
  useEffect(() => {
    const touche = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  });

  const basculer = (s: string) => {
    const morceaux = vOptions.split(/\s+/).filter(Boolean);
    const mots = s.split(" ");
    const present = vOptions.includes(s);
    if (present) setOptions(vOptions.replace(s, "").replace(/\s{2,}/g, " ").trim());
    else setOptions([...morceaux, ...mots].join(" "));
  };

  const enregistrer = () => {
    setEnvoi("envoi");
    setErreur(null);
    api
      .reglerJeu({
        appId,
        optionsLancement: vOptions.trim() !== base.options.trim() ? vOptions.trim() : null,
        majAuto: vMaj !== base.maj && d?.installe ? vMaj : null,
        telechargementsEnJeu: vArriere !== base.arriere && d?.installe ? vArriere : null,
      })
      .then((f) => {
        client.setQueryData(["file-steam"], f);
        void client.invalidateQueries({ queryKey: ["proprietes", appId] });
        setEnvoi("fait");
        setOptions(null);
        setMaj(null);
        setArriere(null);
      })
      .catch((e) => {
        setEnvoi("repos");
        setErreur(estErreurApp(e) ? e.message : String(e));
      });
  };

  const attente = d?.enAttente;
  const statut = attente
    ? file?.phase === "attenteJeu"
      ? `Enregistré : appliqué dès que tu quittes ${nomEnCours ?? "ton jeu"} (Steam redémarre caché).`
      : file?.phase === "redemarrage"
        ? "Steam redémarre caché pour appliquer tes réglages…"
        : "Enregistré : Steam va redémarrer caché pour l’appliquer."
    : envoi === "fait"
      ? "Appliqué."
      : null;

  const onglets: { id: Onglet; libelle: string; muet?: boolean }[] = [
    { id: "general", libelle: "Général" },
    { id: "maj", libelle: "Mises à jour", muet: d && !d.installe },
    { id: "fichiers", libelle: "Fichiers", muet: d && !d.installe },
    { id: "dlc", libelle: `DLC${dlc.data?.length ? ` · ${dlc.data.length}` : ""}` },
    { id: "notes", libelle: "Notes" },
  ];

  return createPortal(
    <>
      <div className={`achat__voile ${sortie ? "is-sortie" : ""}`} onClick={fermer} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="prop-titre" className={`achat prop ${sortie ? "is-sortie" : ""}`}>
        <div className="prop__entete">
          <span className="prop__jaquette" style={jaquette ? { backgroundImage: `url("${jaquette}")` } : undefined} />
          <div className="prop__titres">
            <span className="kicker">
              <span className="kicker__dot" />
              Propriétés
            </span>
            <h2 id="prop-titre" className="achat__titre">
              {nom}
            </h2>
          </div>
          <button type="button" className="prop__fermer" aria-label="Fermer" onClick={fermer}>
            ×
          </button>
        </div>

        <div className="ruban__onglets prop__onglets" role="tablist">
          {onglets.map((o) => (
            <button key={o.id} type="button" role="tab" aria-selected={onglet === o.id} className={`ruban__onglet${onglet === o.id ? " is-actif" : ""}${o.muet ? " is-muet" : ""}`} onClick={() => setOnglet(o.id)}>
              {o.libelle}
            </button>
          ))}
        </div>

        <div key={onglet} className="prop__corps">
          {!d && p.isLoading && <p className="achat__texte">Lecture des fichiers de Steam…</p>}
          {p.isError && <p className="message">{estErreurApp(p.error) ? p.error.message : String(p.error)}</p>}

          {d && onglet === "general" && (
            <>
              <label className="prop__etiquette" htmlFor="prop-options">
                Options de lancement
              </label>
              <input
                id="prop-options"
                className="prop__champ"
                value={vOptions}
                spellCheck={false}
                placeholder="Aucune option"
                onChange={(e) => setOptions(e.target.value)}
              />
              <div className="prop__puces">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className={`prop__puce${vOptions.split(/\s+/).includes(s.split(" ")[0]) ? " is-actif" : ""}`} onClick={() => basculer(s)}>
                    {s}
                  </button>
                ))}
              </div>
              <p className="prop__aide">Steam les ajoute à chaque lancement. Chaque jeu a les siennes : celles qu’il ne connaît pas sont ignorées.</p>
            </>
          )}

          {d && onglet === "maj" &&
            (d.installe ? (
              <>
                <span className="prop__etiquette">Mises à jour automatiques</span>
                <Choix options={MAJ} valeur={vMaj} onChange={setMaj} />
                <span className="prop__etiquette">Téléchargements pendant que tu joues à ce jeu</span>
                <Choix options={ARRIERE_PLAN} valeur={vArriere} onChange={setArriere} />
              </>
            ) : (
              <p className="achat__texte">Installe le jeu pour régler ses mises à jour.</p>
            ))}

          {d && onglet === "fichiers" &&
            (d.installe ? (
              <div className="prop__fichiers">
                <Ligne cle="Taille sur le disque" valeur={taille(d.taille)} />
                <Ligne cle="Dossier" valeur={d.dossier ?? "—"} />
                <Ligne cle="Langue du jeu" valeur={d.langue ? (LANGUES[d.langue] ?? d.langue) : "—"} />
                <Ligne cle="Version" valeur={d.version ?? "—"} />
                <Ligne cle="Dernière mise à jour" valeur={d.derniereMaj ? date(d.derniereMaj) : "—"} />
                <div className="prop__actions">
                  <button type="button" className="btn btn--secondaire btn--petit" onClick={() => void api.ouvrirDossierJeu(appId).catch((e) => setErreur(estErreurApp(e) ? e.message : String(e)))}>
                    Ouvrir le dossier
                  </button>
                  <button type="button" className="btn btn--secondaire btn--petit" onClick={() => void api.steamLien({ type: "verifier", appId })} title="Ouvre la vérification dans Steam">
                    Vérifier les fichiers
                  </button>
                </div>
                <p className="prop__aide">La vérification des fichiers se fait dans une petite fenêtre de Steam.</p>
              </div>
            ) : (
              <p className="achat__texte">Le jeu n’est pas installé sur ce PC.</p>
            ))}

          {onglet === "notes" && <OngletNotes appId={appId} onOuvrir={() => setHistorique(true)} />}
          {onglet === "dlc" && (
            <div className="prop__dlc">
              {dlc.isLoading && <p className="achat__texte">Lecture des DLC du magasin…</p>}
              {dlc.data && listeDlc.length === 0 && <p className="achat__texte">Le magasin ne liste aucun DLC pour ce jeu.</p>}
              {listeDlc.map((x) => (
                <button
                  key={x.appId}
                  type="button"
                  className="prop__dlc-ligne"
                  onClick={() => {
                    onFermer();
                    navigate(`/jeu/${x.appId}`);
                  }}
                >
                  <span className="prop__dlc-image" style={x.banniere ? { backgroundImage: `url("${viaCache(x.banniere)}")` } : undefined} />
                  <span>{x.nom}</span>
                  {installes.has(x.appId) ? <span className="prop__dlc-etat">Installé</span> : <BlocPrix p={x} />}
                </button>
              ))}
              {listeDlc.length > 0 && (
                <p className="prop__aide">
                  Steam ne dit pas aux autres apps quels DLC tu possèdes : seuls ceux qui ont des fichiers sur ce PC sont marqués « Installé ».
                  Les DLC cosmétiques (skins, packs) n’en ont pas.
                </p>
              )}
            </div>
          )}
        </div>

        {erreur && <p className="message">{erreur}</p>}
        {statut && (
          <p className="prop__statut">
            <span className="kicker__dot" />
            {statut}
          </p>
        )}

        <div className="achat__boutons">
          <button type="button" className="btn btn--secondaire btn--petit" onClick={fermer}>
            Fermer
          </button>
          <button type="button" className="btn btn--principal btn--petit" onClick={enregistrer} disabled={!change || envoi === "envoi"}>
            {envoi === "envoi" ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
      {historique && <HistoriqueNotes appId={appId} nom={nom} onFermer={() => setHistorique(false)} />}
    </>,
    document.body,
  );
}

/** Onglet « Notes » : les dernières annonces, et toutes les notes en plein écran. */
function OngletNotes({ appId, onOuvrir }: { appId: number; onOuvrir: () => void }) {
  const q = useQuery({ queryKey: ["historique-notes-court", appId], queryFn: () => api.historiqueNotes(appId, null), staleTime: 30 * 60_000 });
  const liste = q.data?.annonces.slice(0, 5) ?? [];
  return (
    <div className="prop__notes">
      {q.isLoading && <p className="prop__statut">Chargement des annonces…</p>}
      {!q.isLoading && !liste.length && <p className="prop__statut">Pas d’annonce officielle pour ce jeu.</p>}
      <ul>
        {liste.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={onOuvrir}>
              <span>{new Date(a.date * 1000).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</span>
              <strong>{a.titre}</strong>
              {a.patch && <em>Patch</em>}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn--principal btn--petit" onClick={onOuvrir}>
        <IconCarnet size={16} />
        Toutes les notes de mise à jour
      </button>
    </div>
  );
}

function Choix({ options, valeur, onChange }: { options: { v: number; titre: string; detail: string }[]; valeur: number; onChange: (v: number) => void }) {
  return (
    <div className="prop__choix" role="radiogroup">
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={valeur === o.v} className={`prop__option${valeur === o.v ? " is-actif" : ""}`} onClick={() => onChange(o.v)}>
          <span className="prop__rond" aria-hidden="true" />
          <span>
            <strong>{o.titre}</strong>
            <span>{o.detail}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function Ligne({ cle, valeur }: { cle: string; valeur: string }) {
  return (
    <div className="prop__ligne">
      <span>{cle}</span>
      <span title={valeur}>{valeur}</span>
    </div>
  );
}
