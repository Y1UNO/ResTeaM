# Maquettes

- `01` à `06` : écrans validés, dans la DA Nocturne · Clair de lune. **`01-accueil-reference-V3` est la référence de toute la DA.**
- `_archives/` : pistes abandonnées (V1, V2 avec 4 thèmes de couleur, Bento V1). À garder pour mémoire, mais **à ne pas suivre**.

Chaque fichier contient :
- le HTML et les styles inline (mise en page, couleurs, rayons, ombres) ;
- les animations, dans le `<style>` du `<helmet>` ;
- les interactions et les données d'exemple, dans la classe `Component` en bas du fichier.

Les `{{…}}` sont des valeurs calculées dans `renderVals()`. `<sc-for>` est une boucle et `<sc-if>` une condition.

Les fichiers ont besoin du runtime du canevas pour s'afficher : ce sont des **références à reproduire**, pas du code à réutiliser tel quel. Les images de jeux sont des dégradés de remplacement ; dans l'app, ce seront les vraies images Steam.
