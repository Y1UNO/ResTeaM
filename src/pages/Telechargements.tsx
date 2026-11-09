import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/commandes";
import { useBibliotheque, useFileSteam, useImages, useJeuxInstalles, useNomJeu, useStatsSysteme } from "../api/requetes";
import type { JeuInstalle } from "../api/types";
import { Smoke } from "../components/Smoke";
import { Lucioles } from "../components/Vivant";
import { CarteDebit, GlisserInstaller, InfosDisques, useHistoriqueDebits } from "./telechargements/Activite";
import { useInstallation } from "../installation/store";
import { date, taille } from "../lib/format";
import { degradeJaquette, imagesDe } from "../lib/images";
import { debit, dureeRestante, useVitesse } from "../lib/telechargement";
import "./pages.css";
import "./secondaires.css";

const enCours = (j: JeuInstalle) => j.etat === "telechargement" || j.etat === "enPause";

/**
 * Téléchargements (étape 8) : en cours (lu sur le disque toutes les 2 s), en attente
 * d'un redémarrage de Steam, mises à jour requises, puis installés récemment et
 * l'espace libre de chaque disque.
 */
export function Telechargements() {
  const installes = useJeuxInstalles(true);
  const file = useFileSteam().data;
  const stats = useStatsSysteme(true);
  const biblio = useBibliotheque();
  const tous = installes.data ?? [];
  const historique = useHistoriqueDebits(stats.data);
  const jeuxBiblio = useMemo(() => {
    const installesIds = new Set(tous.map((j) => j.appId));
    return (biblio.data?.donnees.jeux ?? []).map((j) => (installesIds.has(j.appId) ? j : { ...j, installation: null }));
  }, [biblio.data, tous]);
  const actifs = tous.filter(enCours);
  const majs = tous.filter((j) => j.etat === "miseAJourRequise");
  const recents = [...tous].filter((j) => j.etat === "installe").sort((a, b) => b.derniereMaj - a.derniereMaj).slice(0, 8);
  const attente = [...(file?.installations ?? []).map((id) => ({ id, type: "installation" as const })), ...(file?.desinstallations ?? []).map((id) => ({ id, type: "desinstallation" as const }))];
  const images = useImages([...tous.map((j) => j.appId), ...attente.map((a) => a.id)]);
  const noms = useMemo(() => new Map((biblio.data?.donnees.jeux ?? []).map((j) => [j.appId, j.nom])), [biblio.data]);

  const disques = useMemo(() => {
    const parLecteur = new Map<string, { lecteur: string; jeux: number; poids: number }>();
    for (const j of tous) {
      const l = j.bibliotheque.slice(0, 2).toUpperCase();
      const d = parLecteur.get(l) ?? { lecteur: l, jeux: 0, poids: 0 };
      d.jeux += 1;
      d.poids += j.taille;
      parLecteur.set(l, d);
    }
    return [...parLecteur.values()].sort((a, b) => a.lecteur.localeCompare(b.lecteur));
  }, [tous]);

  const rien = installes.data && actifs.length === 0 && attente.length === 0 && majs.length === 0;

  return (
    <div className="page">
      <Smoke variant="top" />
      <Lucioles graine={23} nombre={10} />
      <div className="page__content secondaire">
        <div className="page__header">
          <h1 className="page__title">Téléchargements</h1>
          <span className="placeholder-note">
            {installes.data ? `${actifs.length} en cours · ${tous.length} jeux installés` : "Lecture du disque…"}
          </span>
        </div>

        <section className="secondaire__bloc" aria-labelledby="dl-activite">
          <h2 id="dl-activite" className="secondaire__titre">
            Activité en direct
          </h2>
          <div className="dl-graphes">
            <CarteDebit titre="Connexion" valeurs={historique.reseau} couleur="#9fd8ff" note="tout le PC" />
            <CarteDebit titre="Écriture disque" valeurs={historique.disque} couleur="#3fe08a" note="par Steam" />
          </div>
          <InfosDisques jeux={tous} stats={stats.data} />
        </section>

        <section className="secondaire__bloc" aria-labelledby="dl-installer">
          <h2 id="dl-installer" className="secondaire__titre">
            Installer un jeu
          </h2>
          <GlisserInstaller jeux={jeuxBiblio} />
        </section>

        {rien && (
          <div className="vide">
            <svg aria-hidden="true" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
            </svg>
            <strong>Rien ne se télécharge</strong>
            <span>Installe un jeu depuis ta bibliothèque : tu suivras son téléchargement ici.</span>
          </div>
        )}

        {actifs.length > 0 && (
          <section className="secondaire__bloc" aria-labelledby="dl-cours">
            <h2 id="dl-cours" className="secondaire__titre">
              En cours
            </h2>
            {actifs.map((j, i) => (
              <LigneTelechargement key={j.appId} jeu={j} index={i} jaquette={imagesDe(j.appId, images.data).jaquettePetite ?? null} hero={imagesDe(j.appId, images.data).hero} />
            ))}
          </section>
        )}

        {attente.length > 0 && (
          <section className="secondaire__bloc" aria-labelledby="dl-attente">
            <h2 id="dl-attente" className="secondaire__titre">
              En attente de Steam
            </h2>
            {attente.map((a, i) => (
              <LigneAttente key={`${a.type}-${a.id}`} appId={a.id} type={a.type} nom={noms.get(a.id) ?? `Jeu ${a.id}`} jaquette={imagesDe(a.id, images.data).jaquettePetite ?? null} index={i} />
            ))}
          </section>
        )}

        {majs.length > 0 && (
          <section className="secondaire__bloc" aria-labelledby="dl-majs">
            <h2 id="dl-majs" className="secondaire__titre">
              Mises à jour à faire
            </h2>
            <p className="secondaire__note">Steam les télécharge au prochain lancement du jeu, ou tout de suite depuis Steam.</p>
            {majs.map((j, i) => (
              <div key={j.appId} className="dl-ligne" style={{ animationDelay: `${i * 40}ms` }}>
                <Jaquette url={imagesDe(j.appId, images.data).jaquettePetite ?? null} nom={j.nom} />
                <div className="dl-ligne__texte">
                  <strong>{j.nom}</strong>
                  <span>{taille(j.taille)} · mis à jour le {j.derniereMaj ? date(j.derniereMaj) : "—"}</span>
                </div>
                <button type="button" className="btn btn--secondaire btn--petit" onClick={() => void api.steamLien({ type: "telechargements" })}>
                  Ouvrir dans Steam
                </button>
              </div>
            ))}
          </section>
        )}

        {recents.length > 0 && (
          <section className="secondaire__bloc" aria-labelledby="dl-recents">
            <h2 id="dl-recents" className="secondaire__titre">
              Installés récemment
            </h2>
            <div className="dl-recents">
              {recents.map((j, i) => (
                <div key={j.appId} className="dl-recent" style={{ animationDelay: `${i * 40}ms` }}>
                  <Jaquette url={imagesDe(j.appId, images.data).jaquettePetite ?? null} nom={j.nom} />
                  <strong>{j.nom}</strong>
                  <span>
                    {taille(j.taille)} · {j.derniereMaj ? date(j.derniereMaj) : ""}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {disques.length > 0 && (
          <section className="secondaire__bloc" aria-labelledby="dl-disques">
            <h2 id="dl-disques" className="secondaire__titre">
              Tes disques
            </h2>
            <div className="dl-disques">
              {disques.map((d) => {
                const libre = stats.data?.disques.find((x) => x.lecteur.toUpperCase() === d.lecteur)?.libre;
                return (
                  <div key={d.lecteur} className="dl-disque">
                    <strong>{d.lecteur}</strong>
                    <span>
                      {d.jeux} jeu{d.jeux > 1 ? "x" : ""} · {taille(d.poids)}
                    </span>
                    <span className="dl-disque__libre">{libre != null ? `${taille(libre)} libres` : "…"}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Jaquette({ url, nom }: { url: string | null; nom: string }) {
  return (
    <span className="dl-jaquette" style={url ? { backgroundImage: `url("${url}")` } : { background: degradeJaquette(nom) }} />
  );
}

function LigneTelechargement({ jeu, index, jaquette, hero }: { jeu: JeuInstalle; index: number; jaquette: string | null; hero: string | null }) {
  const ouvrirSuivi = useInstallation((s) => s.ouvrirSuivi);
  const pause = jeu.etat === "enPause";
  const vitesse = useVitesse(jeu.appId, pause ? null : jeu.telecharge);
  const fraction = jeu.aTelecharger > 0 ? Math.min(1, jeu.telecharge / jeu.aTelecharger) : 0;
  const reste = vitesse && vitesse > 0 && jeu.aTelecharger > 0 ? (jeu.aTelecharger - jeu.telecharge) / vitesse : Infinity;
  return (
    <div data-lueur="" className="dl-ligne dl-ligne--active" style={{ animationDelay: `${index * 40}ms` }}>
      <Jaquette url={jaquette} nom={jeu.nom} />
      <div className="dl-ligne__texte">
        <strong>{jeu.nom}</strong>
        <div className="dl-barre" aria-hidden="true">
          <span style={{ width: `${fraction * 100}%` }} className={pause ? "is-pause" : ""} />
        </div>
        <span>
          {jeu.aTelecharger > 0 ? `${taille(jeu.telecharge)} sur ${taille(jeu.aTelecharger)}` : "Préparation…"}
          {pause ? " · en pause" : vitesse ? ` · ${debit(vitesse)} · ${dureeRestante(reste)}` : ""}
        </span>
      </div>
      <span className="dl-ligne__pct">{jeu.aTelecharger > 0 ? `${Math.floor(fraction * 100)} %` : "…"}</span>
      <button type="button" className="btn btn--principal btn--petit" onClick={() => ouvrirSuivi({ appId: jeu.appId, nom: jeu.nom, jaquette, hero })}>
        Suivre
      </button>
    </div>
  );
}

function LigneAttente({ appId, type, nom, jaquette, index }: { appId: number; type: "installation" | "desinstallation"; nom: string; jaquette: string | null; index: number }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const file = useFileSteam().data;
  const nomEnCours = useNomJeu(file?.jeuEnCours);
  const raison =
    file?.phase === "redemarrage"
      ? "Steam redémarre caché…"
      : file?.phase === "attenteJeu"
        ? `partira dès que tu quittes ${nomEnCours ?? "ton jeu"}`
        : "va démarrer";
  return (
    <div className="dl-ligne" style={{ animationDelay: `${index * 40}ms` }}>
      <Jaquette url={jaquette} nom={nom} />
      <div className="dl-ligne__texte">
        <strong>{nom}</strong>
        <span>
          {type === "installation" ? "Installation" : "Désinstallation"} · {raison}
        </span>
      </div>
      <button type="button" className="btn btn--secondaire btn--petit" onClick={() => navigate(`/jeu/${appId}`)}>
        Fiche
      </button>
      <button
        type="button"
        className="btn btn--secondaire btn--petit"
        disabled={file?.phase === "redemarrage"}
        onClick={() =>
          void api.annulerFileSteam(appId).then((f) => {
            client.setQueryData(["file-steam"], f);
            void client.invalidateQueries({ queryKey: ["installes"] });
          })
        }
      >
        Annuler
      </button>
    </div>
  );
}
