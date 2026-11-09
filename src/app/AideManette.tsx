import { useEffect, useState } from "react";
import "./AideManette.css";

/** Rappel des touches, quelques secondes, quand une manette se branche. */
export function AideManette() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let t = 0;
    const sur = (e: Event) => {
      if (!(e as CustomEvent<boolean>).detail) return;
      setVisible(true);
      window.clearTimeout(t);
      t = window.setTimeout(() => setVisible(false), 5500);
    };
    window.addEventListener("manette", sur);
    return () => {
      window.removeEventListener("manette", sur);
      window.clearTimeout(t);
    };
  }, []);
  if (!visible) return null;
  return (
    <div className="aide-manette" role="status">
      <strong>Manette connectée</strong>
      <span>
        <kbd>A</kbd> choisir
      </span>
      <span>
        <kbd>B</kbd> retour
      </span>
      <span>
        <kbd>LB</kbd>
        <kbd>RB</kbd> pages
      </span>
      <span>
        <kbd>Y</kbd> recherche
      </span>
      <span>
        <kbd>≡</kbd> mode Salon
      </span>
    </div>
  );
}
