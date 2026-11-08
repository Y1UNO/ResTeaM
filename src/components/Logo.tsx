import { useId } from "react";
import "./Logo.css";

type LogoProps = {
  /** Taille en pixels (carré). */
  size?: number;
  /** Afficher la tuile charbon derrière la lune. */
  tile?: boolean;
  className?: string;
};

/**
 * Logo ResTeaM « Lune à engrenages » (assets-src/logo/resteam-logo-anime.svg), en ligne
 * pour que les animations CSS fonctionnent : les engrenages tournent et la lune respire.
 * Les identifiants du masque et du dégradé sont uniques, pour pouvoir afficher
 * le logo plusieurs fois (barre + écran de connexion).
 */
export function Logo({ size = 42, tile = true, className }: LogoProps) {
  const uid = useId().replace(/:/g, "");
  const mask = `rt-moon-mask-${uid}`;
  const grad = `rt-moon-grad-${uid}`;

  return (
    <svg
      className={`rt-logo${className ? ` ${className}` : ""}`}
      viewBox="0 0 200 200"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <mask id={mask}>
          <rect width="200" height="200" fill="#000" />
          <circle cx="100" cy="100" r="80" fill="#fff" />
          <circle cx="118" cy="84" r="64" fill="#000" />
        </mask>
        <linearGradient id={grad} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#1E9E58" />
          <stop offset=".55" stopColor="#3FE08A" />
          <stop offset="1" stopColor="#A6FFCB" />
        </linearGradient>
      </defs>
      {tile && <rect x="4" y="4" width="192" height="192" rx="44" fill="#141617" />}
      <rect className="rt-moon" width="200" height="200" fill={`url(#${grad})`} mask={`url(#${mask})`} />
      <g className="rt-gear-big">
        <path
          d="M131.5 96.0 L136.9 97.7 L135.9 103.5 L130.2 103.3 L128.6 106.8 L132.5 110.9 L128.7 115.5 L123.9 112.4 L120.8 114.6 L122.0 120.2 L116.4 122.2 L113.8 117.2 L110.0 117.5 L108.3 122.9 L102.5 121.9 L102.7 116.2 L99.2 114.6 L95.1 118.5 L90.5 114.7 L93.6 109.9 L91.4 106.8 L85.8 108.0 L83.8 102.4 L88.8 99.8 L88.5 96.0 L83.1 94.3 L84.1 88.5 L89.8 88.7 L91.4 85.2 L87.5 81.1 L91.3 76.5 L96.1 79.6 L99.2 77.4 L98.0 71.8 L103.6 69.8 L106.2 74.8 L110.0 74.5 L111.7 69.1 L117.5 70.1 L117.3 75.8 L120.7 77.4 L124.9 73.5 L129.5 77.3 L126.4 82.1 L128.6 85.2 L134.2 84.0 L136.2 89.6 L131.2 92.2 Z"
          fill="#2C3134"
          stroke="#4B5357"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <circle cx="110" cy="96" r="7" fill="#1A1D1F" stroke="#3FE08A" strokeWidth="2.4" />
      </g>
      <g className="rt-gear-medium">
        <path
          d="M152.3 73.5 L156.4 75.8 L154.0 81.1 L149.5 79.5 L147.0 81.8 L148.1 86.4 L142.7 88.4 L140.7 84.1 L137.2 84.0 L134.9 88.1 L129.6 85.7 L131.2 81.2 L128.9 78.7 L124.3 79.8 L122.3 74.4 L126.6 72.4 L126.7 68.9 L122.6 66.6 L125.0 61.3 L129.5 62.9 L132.0 60.6 L130.9 56.0 L136.3 54.0 L138.3 58.3 L141.8 58.4 L144.1 54.3 L149.4 56.7 L147.8 61.2 L150.1 63.7 L154.7 62.6 L156.7 68.0 L152.4 70.0 Z"
          fill="#2C3134"
          stroke="#4B5357"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <circle cx="139.5" cy="71.2" r="4.5" fill="#1A1D1F" stroke="#3FE08A" strokeWidth="1.6" />
      </g>
      <g className="rt-gear-small">
        <path
          d="M144.4 118.4 L146.7 121.0 L143.2 124.6 L140.5 122.3 L137.7 123.1 L136.6 126.4 L131.7 125.1 L132.3 121.6 L130.3 119.6 L126.8 120.3 L125.5 115.4 L128.8 114.2 L129.6 111.4 L127.3 108.8 L130.8 105.2 L133.5 107.5 L136.3 106.7 L137.4 103.4 L142.3 104.7 L141.7 108.2 L143.7 110.2 L147.2 109.5 L148.5 114.4 L145.2 115.6 Z"
          fill="#2C3134"
          stroke="#4B5357"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <circle cx="137" cy="114.9" r="3" fill="#1A1D1F" stroke="#3FE08A" strokeWidth="1.2" />
      </g>
    </svg>
  );
}
