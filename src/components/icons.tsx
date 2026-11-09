/*
 * Icônes de la barre de navigation, dessinées dans la DA « lune et engrenages »
 * (demande de Tom) : trait fin, un croissant ou une dent d'engrenage dans chaque
 * icône, et un petit mouvement au survol (voir icons.css, classes `ico-*`).
 */
import "./icons.css";

type IconProps = { size?: number };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** Bibliothèque : trois tuiles et un croissant de lune à la place de la quatrième. */
export function IconLibrary({ size = 22 }: IconProps) {
  return (
    <svg className="ico ico-biblio" aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <rect x="3" y="3" width="7.2" height="7.2" rx="2" />
      <rect x="13.8" y="3" width="7.2" height="7.2" rx="2" />
      <rect x="3" y="13.8" width="7.2" height="7.2" rx="2" />
      <path className="ico-lune" d="M18.6 13.6a3.9 3.9 0 1 0 2.9 6.2 3.1 3.1 0 1 1-2.9-6.2z" fill="currentColor" fillOpacity="0.25" />
    </svg>
  );
}

/** Magasin : sac aux anses en arc, avec un éclat de lune. */
export function IconStore({ size = 22 }: IconProps) {
  return (
    <svg className="ico ico-magasin" aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <path d="M5 8h14l-1.1 11.2a2 2 0 0 1-2 1.8H8.1a2 2 0 0 1-2-1.8z" />
      <path className="ico-anse" d="M9 8V6.5a3 3 0 0 1 6 0V8" />
      <path className="ico-eclat" d="M12 12.2l.7 1.5 1.6.2-1.2 1.1.3 1.6-1.4-.8-1.4.8.3-1.6-1.2-1.1 1.6-.2z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Classements : trois barres et une étoile au sommet de la plus haute. */
export function IconCharts({ size = 22 }: IconProps) {
  return (
    <svg className="ico ico-classements" aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <path className="ico-barre b1" d="M5 20v-6" />
      <path className="ico-barre b2" d="M12 20V9" />
      <path className="ico-barre b3" d="M19 20v-9" />
      <path d="M3 20.5h18" opacity="0.5" />
      <path className="ico-etoile" d="M12 2.6l.8 1.6 1.7.3-1.3 1.2.3 1.7-1.5-.8-1.5.8.3-1.7-1.3-1.2 1.7-.3z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Liste de souhaits : un croissant qui tient une étoile. */
export function IconWishlist({ size = 22 }: IconProps) {
  return (
    <svg className="ico ico-souhaits" aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <path d="M14.5 3.2A8.6 8.6 0 1 0 20.8 15a6.9 6.9 0 1 1-6.3-11.8z" />
      <path className="ico-etoile" d="M16.4 6.8l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z" fill="currentColor" fillOpacity="0.3" />
    </svg>
  );
}

/** Recherche : loupe dont le verre est un croissant. */
export function IconSearch({ size = 21 }: IconProps) {
  return (
    <svg className="ico ico-recherche" aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path className="ico-lune" d="M12.6 6.4a4.2 4.2 0 1 0 1.8 6 3.3 3.3 0 1 1-1.8-6z" fill="currentColor" fillOpacity="0.25" stroke="none" />
      <path d="M15.4 15.4L20.5 20.5" />
    </svg>
  );
}

/** Téléchargements : flèche qui descend dans un engrenage ouvert. */
export function IconDownloads({ size = 21 }: IconProps) {
  return (
    <svg className="ico ico-telecharger" aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <path className="ico-fleche" d="M12 3v10M8 9.5l4 4 4-4" />
      <path className="ico-roue" d="M4.5 15.5a7.5 4.5 0 0 0 15 0M3.8 17.6l1.4-.4M20.2 17.6l-1.4-.4M12 20v1.4" />
    </svg>
  );
}

/** Communauté : deux silhouettes sous un croissant. */
/**
 * Communauté : le « panier communautaire » (demande de Tom). Un panier tressé,
 * deux joueurs qui en dépassent, et le croissant au-dessus. Au survol, les deux
 * têtes sortent un peu du panier et le croissant tourne.
 */
export function IconCommunity({ size = 22 }: IconProps) {
  return (
    <svg className="ico ico-communaute" aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <g className="ico-tetes">
        <circle cx="8.6" cy="8.4" r="2.1" />
        <circle cx="15.4" cy="8.9" r="1.8" />
      </g>
      <path d="M3 12.2h18" />
      <path d="M4.4 12.2l1.5 7.1a1.6 1.6 0 0 0 1.6 1.3h9a1.6 1.6 0 0 0 1.6-1.3l1.5-7.1" />
      <path d="M9.3 15.2l.4 3M14.7 15.2l-.4 3M12 15v3.2" strokeWidth="1.3" />
      <path className="ico-lune" d="M11.3 1.6a2.2 2.2 0 1 0 1.9 3.3 1.8 1.8 0 1 1-1.9-3.3z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconSettings({ size = 18 }: IconProps) {
  return (
    <svg className="ico ico-reglages" aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

export function IconLogout({ size = 18 }: IconProps) {
  return (
    <svg className="ico" aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 8l-4 4 4 4M6 12h10" />
    </svg>
  );
}

/** Silhouette affichée dans l'avatar tant que le compte Steam n'est pas connecté. */
export function IconPerson({ size = 22 }: IconProps) {
  return (
    <svg className="ico" aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M5 20c.9-3.6 3.7-5.6 7-5.6s6.1 2 7 5.6" />
    </svg>
  );
}
