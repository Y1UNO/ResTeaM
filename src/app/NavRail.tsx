import { useEffect, useState, type ReactNode } from "react";
import { useJoueurMoi } from "../api/requetes";
import { useLocation, useNavigate } from "react-router-dom";
import {
  IconCharts,
  IconDownloads,
  IconLibrary,
  IconPerson,
  IconSearch,
  IconStore,
  IconWishlist,
} from "../components/icons";
import { LogoMenu } from "./LogoMenu";
import { PATHS } from "./paths";
import "./NavRail.css";

type RailItem = {
  label: string;
  to: string;
  icon: ReactNode;
  /** Chemins (préfixes) qui allument cet élément. */
  match: string[];
};

/** Les 4 vues principales, dans l'ordre de la maquette 01. */
const MAIN: RailItem[] = [
  {
    label: "Bibliothèque",
    to: PATHS.accueil,
    icon: <IconLibrary />,
    match: [PATHS.accueil, PATHS.bibliotheque],
  },
  { label: "Magasin", to: PATHS.magasin, icon: <IconStore />, match: [PATHS.magasin, "/jeu"] },
  { label: "Classements", to: PATHS.classements, icon: <IconCharts />, match: [PATHS.classements] },
  { label: "Liste de souhaits", to: PATHS.souhaits, icon: <IconWishlist />, match: [PATHS.souhaits] },
];

/** Outils en bas de la barre. */
const TOOLS: RailItem[] = [
  { label: "Rechercher (Ctrl K)", to: PATHS.recherche, icon: <IconSearch />, match: [PATHS.recherche] },
  {
    label: "Téléchargements",
    to: PATHS.telechargements,
    icon: <IconDownloads />,
    match: [PATHS.telechargements],
  },
];

function isActive(pathname: string, match: string[]) {
  return match.some((m) =>
    m === "/" ? pathname === "/" : pathname === m || pathname.startsWith(m + "/"),
  );
}

/**
 * Barre de navigation transparente à gauche (maquette 01) :
 * pas de fond plein, un dégradé sombre et un fin liseré lumineux.
 * En bas, l'avatar Steam (silhouette neutre tant qu'il n'est pas chargé).
 */
export function NavRail() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const profileActive = isActive(pathname, [PATHS.profil]);
  const joueur = useJoueurMoi();
  const avatarUrl = joueur.data?.donnees.avatar;
  const personaName = joueur.data?.donnees.pseudo;
  const [avatarCasse, setAvatarCasse] = useState(false);
  useEffect(() => setAvatarCasse(false), [avatarUrl]);

  const renderItem = (item: RailItem, tool = false) => {
    const active = isActive(pathname, item.match);
    return (
      <button
        key={item.to}
        type="button"
        className={`rail__btn${tool ? " rail__btn--tool" : ""}${active ? " is-active" : ""}`}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        title={item.label}
        onClick={() => navigate(item.to)}
      >
        <span aria-hidden="true" className="rail__bar" />
        {item.icon}
      </button>
    );
  };

  const profileLabel =
    (personaName ? `Profil · ${personaName}` : "Profil") + (joueur.data?.horsLigne ? " · hors ligne" : "");

  return (
    <nav aria-label="Navigation principale" className="rail">
      <LogoMenu />

      {MAIN.map((item) => renderItem(item))}

      <div className="rail__spacer" />

      {TOOLS.map((item) => renderItem(item, true))}

      <button
        type="button"
        className={`rail__avatar${profileActive ? " is-active" : ""}`}
        aria-label={profileLabel}
        aria-current={profileActive ? "page" : undefined}
        title={profileLabel}
        onClick={() => navigate(PATHS.profil)}
      >
        <span aria-hidden="true" className="rail__bar rail__bar--avatar" />
        <span className="rail__avatar-img">
          {avatarUrl && !avatarCasse ? (
            <img
              key={avatarUrl}
              className="rail__avatar-photo"
              src={avatarUrl}
              alt=""
              draggable={false}
              onError={() => setAvatarCasse(true)}
            />
          ) : (
            <IconPerson />
          )}
        </span>
      </button>
    </nav>
  );
}
