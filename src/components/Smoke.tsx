import type { CSSProperties } from "react";
import "./Smoke.css";

type SmokeProps = {
  /**
   * - `hero` : en bas d'un hero (maquettes 01 et 02), fondu vers le fond de page.
   * - `top`  : en haut de page sans hero (maquettes 03, 05 et 06).
   */
  variant: "hero" | "top";
  className?: string;
  style?: CSSProperties;
};

/** Fumée monochrome : deux nappes floues anthracite et noire qui dérivent lentement. */
export function Smoke({ variant, className, style }: SmokeProps) {
  return (
    <div
      aria-hidden="true"
      className={`smoke smoke--${variant}${className ? ` ${className}` : ""}`}
      style={style}
    >
      <div className="smoke__layer smoke__layer--1" />
      <div className="smoke__layer smoke__layer--2" />
      {variant === "hero" && <div className="smoke__floor" />}
    </div>
  );
}
