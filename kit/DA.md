# Direction artistique — « Nocturne », thème Clair de lune

Référence absolue : `design/01-accueil-reference-V3.dc.html`. En cas de doute, c'est ce fichier qui fait foi.

## Principes

1. **Le jeu est la star.** L'interface est sombre, neutre et discrète ; les images des jeux apportent la couleur.
2. **Sobre et simplifié.** Une action principale par écran. Le reste se découvre au clic sur l'élément lui-même (ex. clic sur la jaquette → patch notes). Pas de boutons en trop.
3. **Lisible avant tout.** Gros titres, chiffres en grand, peu de texte secondaire.
4. **La couleur d'accent ne sert qu'aux interactions** : bouton principal, survol, sélection, jauges, petits points d'état.
5. **Rien ne réagit au curseur** à part les éléments qu'on survole (pas de lueur qui suit la souris).

## Couleurs

| Rôle | Valeur |
|---|---|
| Fond | `#09090A` |
| Surfaces (cartes, panneaux) | `rgba(18,18,20,.55)` à `.65` + `backdrop-filter: blur(14–26px)` |
| Bordures | `rgba(238,242,255,.08)` → `.12` (normal) / `.16–.18` (actif) |
| Texte principal | `#F2F2F3` |
| Texte secondaire | `#C9C9CE` / `#A3A3A8` / `#8E8E94` |
| **Accent Clair de lune** | `#EEF2FF` (texte dessus : `#0A0D14`) |
| Halo de l'accent | `rgba(238,242,255,.12–.45)` en `box-shadow` / `drop-shadow` |

Une seule palette (Clair de lune). Les autres thèmes (Orange sombre, Vert runique, Rosé pourpre) sont en archive, pour plus tard peut-être.

## Typographie

- **Titres et chiffres** : Space Grotesk 700, letter-spacing négatif (−1 à −3 px sur les gros titres)
- **Texte** : Inter 400–700
- Titres de page : 64 px · titre du jeu en vedette : 84–88 px · petits labels : 11–13 px en MAJUSCULES espacées

## Formes

- Rayons : 12–18 px (boutons, petites cartes) · 20–28 px (grandes cartes, panneaux) · 999 px (pastilles, onglets)
- Ombres profondes et noires sous les cartes : `0 14px 30px rgba(0,0,0,.6)` à `0 40px 100px rgba(0,0,0,.9)`

## Effets signature

- **Fumée monochrome** : 2 grandes nappes floues (`blur(50–60px)`), gris anthracite et noir, qui dérivent lentement (30–38 s en boucle), en bas du hero ou en haut de page. Jamais colorées.
- **Image du jeu floutée en fond du hero** + dégradé noir de gauche à droite pour la lisibilité.
- **Jaquette en 3D** : inclinée (`perspective rotateY(-10deg) rotateZ(-3deg)`), grosse ombre portée.
- **Barre de navigation transparente** à gauche : pas de fond plein, juste un dégradé sombre et un fin liseré lumineux (`inset -1px 0 0 rgba(238,242,255,.12)` + halo très léger).
- **Amis à droite** : avatars ronds seuls quand c'est replié ; panneau en verre fumé qui s'ouvre au survol par-dessus le contenu.
- **Croissant de lune** : la jauge de succès ET la jauge d'XP du niveau sont des croissants presque fermés qui se remplissent, avec le chiffre dans le creux.
- **Pluie lunaire** : de fines gouttes lumineuses tombent en boucle sous le croissant du niveau (profil).
- **Icônes** : trait fin blanc lunaire, intérieur légèrement teinté, petit halo. Elles représentent la chose (manette = jeux, sablier = heures, silhouettes = amis, médaille = badges), pas forcément des lunes.

## Animations

- Changement de jeu en vedette : fondu + léger zoom de l'image de fond, titre qui glisse vers le haut, jaquette qui pivote en place.
- Patch notes : la jaquette se redresse et s'efface pendant que le panneau se déploie depuis elle ; à la fermeture, le panneau se replie et la jaquette revient. **Jamais de fermeture instantanée.**
- Listes et grilles : fondu + petite montée à chaque tri ou filtre.
- Survol des cartes : légère montée (4–6 px) + liseré blanc lunaire.
- Courbes d'animation : `cubic-bezier(.2,.7,.2,1)`, durées de 0,35 à 0,9 s.
