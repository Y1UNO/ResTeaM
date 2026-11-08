import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  IconCharts,
  IconDownloads,
  IconLibrary,
  IconPerson,
  IconSearch,
  IconStore,
  IconWishlist,
} from "../components/icons";
import { Logo } from "../components/Logo";
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

type NavRailProps = {
  /** Avatar Steam (étape 2a). Sans avatar, une silhouette neutre. */
  avatarUrl?: string;
  personaName?: string;
};

/**
 * Barre de navigation transparente à gauche (maquette 01) :
 * pas de fond plein, un dégradé sombre et un fin liseré lumineux.
 */
export function NavRail({ avatarUrl, personaName }: NavRailProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const profileActive = isActive(pathname, [PATHS.profil]);

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

  const profileLabel = personaName ? `Profil · ${personaName}` : "Profil";

  return (
    <nav aria-label="Navigation principale" className="rail">
      <Link to={PATHS.accueil} className="rail__logo" aria-label="ResTeaM · accueil" title="ResTeaM">
        <Logo size={42} />
      </Link>

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
          {avatarUrl ? <img src={avatarUrl} alt="" draggable={false} /> : <IconPerson />}
        </span>
      </button>
    </nav>
  );
}
