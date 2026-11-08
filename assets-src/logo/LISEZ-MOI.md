# Logo ResTeaM — « Lune à engrenages »

Un croissant de lune vert, avec 3 engrenages gris charbon qui s'engrènent dans son creux, sur une tuile gris-noir charbon.

## Fichiers

| Fichier | Usage |
|---|---|
| `resteam-logo.svg` | Logo fixe (vectoriel) avec la tuile |
| `resteam-logo-sans-fond.svg` | Logo fixe sans la tuile, à poser sur un fond sombre |
| `resteam-logo-anime.svg` | **Logo animé** : les engrenages tournent et la lune « respire » |
| `resteam-logo-1024/512/256.png` | Exports PNG avec la tuile |
| `resteam-logo-sans-fond-*.png` | Exports PNG sans la tuile (fond transparent) |
| `resteam-logo.ico` | Icône Windows de l'app (16 → 256 px) |

## Couleurs

- Tuile : `#141617`
- Lune : dégradé `#1E9E58` → `#3FE08A` → `#A6FFCB`, avec un halo `rgba(63,224,138,.45)`
- Engrenages : `#2C3134`, contour `#4B5357`
- Moyeux : fond `#1A1D1F`, anneau `#3FE08A`

## L'animation (dans `resteam-logo-anime.svg`)

Tout tient dans le bloc `<style>` du SVG, sans JavaScript :

- **Grand engrenage** (12 dents) : sens horaire, un tour en **24 s**.
- **Moyen** (8 dents) et **petit** (6 dents) : sens inverse, un tour en **16 s** et **12 s**. Les vitesses respectent le nombre de dents, donc les engrenages ont l'air réellement entraînés.
- **Lune** : son halo respire doucement (cycle de 6 s).
- Si Windows a l'option « réduire les animations » activée (`prefers-reduced-motion`), tout s'arrête.

Chaque engrenage tourne autour de son propre centre grâce à `transform-origin`, dans les unités du `viewBox` 200×200 : grand `110 96`, moyen `139.5 71.2`, petit `137 114.9`.

## Instructions pour Claude Code

```
Intègre le logo ResTeaM à partir du dossier logo/ :
- resteam-logo.ico comme icône de l'app Tauri (src-tauri/icons, et régénère les tailles avec `tauri icon` à partir de resteam-logo-1024.png) ;
- resteam-logo-anime.svg en haut de la barre de navigation à gauche (≈ 42 px) et en grand sur l'écran de connexion / chargement. Insère le SVG en ligne (inline), pas en <img>, pour que les animations CSS et les classes .rt-* fonctionnent, et garde le respect de prefers-reduced-motion ;
- option « Animer le logo » dans les paramètres (activée par défaut) qui retire les animations si elle est désactivée.
```
