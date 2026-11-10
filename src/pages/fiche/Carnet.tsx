import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/commandes";
import type { NoteJeu } from "../../api/types";
import { entier, ilYA } from "../../lib/format";
import "./carnet.css";

/** Taille maximale d'une note (la même limite est vérifiée côté Rust). */
export const TAILLE_MAX_NOTE = 20_000;
const MODELES = ["Où j’en suis", "Build", "Codes", "Astuces"];
const DELAI_SAUVEGARDE = 600;

type Statut = "pret" | "attente" | "ecrit" | "erreur";

/** Résumé d'une note pour l'en-tête de la section : sa première ligne. */
export function resumeNote(note: NoteJeu | null | undefined): string {
  if (!note) return "vide · chiffré sur ce PC";
  // La première vraie ligne (les intertitres « Build », « Codes »… sont sautés).
  const lignes = note.texte.split("\n").map((l) => l.trim()).filter(Boolean);
  const premiere = lignes.find((l) => !MODELES.includes(l)) ?? lignes[0] ?? "";
  return `${premiere.length > 48 ? `${premiere.slice(0, 47)}…` : premiere} · ${ilYA(note.modifieLe / 1000)}`;
}

/**
 * Carnet d'un jeu (idée de Tom) : où il en est, ses builds, ses codes, ses astuces.
 * Sauvegarde automatique 600 ms après la dernière frappe (et en quittant). Les notes
 * restent sur le PC, chiffrées par le coffre-fort : rien n'est envoyé.
 */
export function Carnet({ appId, nom, note }: { appId: number; nom: string; note: NoteJeu | null }) {
  const client = useQueryClient();
  const [texte, setTexte] = useState(note?.texte ?? "");
  const [statut, setStatut] = useState<Statut>("pret");
  const [modifieLe, setModifieLe] = useState<number | null>(note?.modifieLe ?? null);
  /** Texte tapé, pas encore envoyé à Rust. */
  const enAttente = useRef<string | null>(null);
  const zone = useRef<HTMLTextAreaElement>(null);

  const enregistrer = useCallback(async () => {
    const t = enAttente.current;
    if (t === null) return;
    enAttente.current = null;
    try {
      const n = await api.noteJeuEcrire(appId, t);
      client.setQueryData(["note-jeu", appId], n);
      setModifieLe(n?.modifieLe ?? null);
      // Une frappe pendant l'enregistrement : on attend la suivante.
      setStatut(enAttente.current === null ? "ecrit" : "attente");
    } catch {
      enAttente.current ??= t;
      setStatut("erreur");
    }
  }, [appId, client]);

  // Sauvegarde automatique après la dernière frappe.
  useEffect(() => {
    if (enAttente.current === null) return;
    const minuteur = setTimeout(() => void enregistrer(), DELAI_SAUVEGARDE);
    return () => clearTimeout(minuteur);
  }, [texte, enregistrer]);

  // En quittant (section repliée, autre page) : ce qui reste est enregistré.
  useEffect(
    () => () => {
      const t = enAttente.current;
      if (t === null) return;
      enAttente.current = null;
      void api
        .noteJeuEcrire(appId, t)
        .then((n) => client.setQueryData(["note-jeu", appId], n))
        .catch(() => undefined);
    },
    [appId, client],
  );

  const changer = (t: string) => {
    enAttente.current = t;
    setTexte(t);
    setStatut("attente");
  };

  /** Ajoute un intertitre (« Build », « Codes »…) à la fin, et place le curseur dessous. */
  const ajouterModele = (titre: string) => {
    const base = texte.replace(/\s+$/, "");
    const suite = `${base}${base ? "\n\n" : ""}${titre}\n`;
    if (suite.length > TAILLE_MAX_NOTE) return;
    changer(suite);
    requestAnimationFrame(() => {
      const z = zone.current;
      if (!z) return;
      z.focus();
      z.setSelectionRange(suite.length, suite.length);
      z.scrollTop = z.scrollHeight;
    });
  };

  const etat =
    statut === "attente"
      ? "Enregistrement…"
      : statut === "erreur"
        ? "Pas enregistré, réessaie"
        : modifieLe
          ? `Enregistré ${ilYA(modifieLe / 1000)}`
          : "Rien d’écrit pour l’instant";

  return (
    <div className="carnet-jeu">
      <div className="carnet-jeu__modeles" role="group" aria-label="Ajouter un intertitre">
        {MODELES.map((m) => (
          <button key={m} type="button" className="carnet-jeu__modele" onClick={() => ajouterModele(m)}>
            <span aria-hidden="true">+</span> {m}
          </button>
        ))}
      </div>
      <div className="carnet-jeu__page">
        <textarea
          ref={zone}
          className="carnet-jeu__zone"
          value={texte}
          maxLength={TAILLE_MAX_NOTE}
          spellCheck
          aria-label={`Mes notes sur ${nom}`}
          placeholder={`Où tu en es dans ${nom}, tes builds, tes codes, tes astuces…`}
          onChange={(e) => changer(e.target.value)}
          onBlur={() => void enregistrer()}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
              e.preventDefault();
              void enregistrer();
            }
          }}
        />
        <span className="carnet-jeu__lune" aria-hidden="true" />
      </div>
      <div className="carnet-jeu__pied">
        <span className="carnet-jeu__prive">
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          Chiffré sur ce PC · rien n’est envoyé
        </span>
        <span className={`carnet-jeu__etat is-${statut}`} aria-live="polite">
          {etat}
        </span>
        <span className={`carnet-jeu__compte${texte.length > TAILLE_MAX_NOTE * 0.9 ? " is-plein" : ""}`}>
          {entier(texte.length)} / {entier(TAILLE_MAX_NOTE)}
        </span>
      </div>
    </div>
  );
}
