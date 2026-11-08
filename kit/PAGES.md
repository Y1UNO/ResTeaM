# Les pages

Toutes les pages partagent la barre de navigation transparente à gauche (Bibliothèque, Magasin, Classements, Liste de souhaits, puis recherche, téléchargements et avatar du profil en bas) et le fond sombre avec la fumée monochrome.

## 1. Accueil / Bibliothèque en vedette — `01-accueil-reference-V3.dc.html`

- **Hero plein écran** : image du jeu floutée en fond, fumée monochrome en bas.
- À gauche :
  - petit label (« Reprendre · joué cette semaine ») et titre du jeu en très grand ;
  - **jauge d'heures à rangs** (voir FONCTIONNALITES.md) ;
  - **croissant de lune des succès**, avec le nombre au centre ;
  - bouton **Jouer** (accent) et bouton **Fiche du jeu**.
- À droite : **la jaquette inclinée en 3D** avec un badge « Nouveau patch ». **Clic → les patch notes se déploient** dans un panneau en verre fumé, avec des sections triées automatiquement : Nouveau, Équilibrage, Performances, Correctifs, Autre.
- En bas : **ruban** « Reprendre là où tu t'es arrêté ». La jaquette sélectionnée est à peine plus grande (environ 10 %), et cliquer une autre jaquette la met en vedette.
- Magasin (même écran, onglet Magasin) : la vedette affiche le prix et la réduction, et le bouton devient « Acheter sur Steam ».
- **Amis** à droite : avatars ronds avec un point d'état. Au survol, le panneau s'ouvre avec les noms, le jeu en cours, **Rejoindre** (si un lobby est ouvert) et **+ Ajouter un ami**.

## 2. Fiche d'un jeu (magasin) — `02-fiche-jeu.dc.html`

- Tags, titre géant, évaluations, date de sortie, « Démo disponible ».
- **Un seul bloc d'achat** : réduction, ancien prix barré, prix, bouton **Acheter** et une étoile pour la liste de souhaits.
- À droite : grande image (trailer ou capture) et 5 miniatures cliquables, avec un changement en fondu.
- En dessous, des **sections dépliables, une seule ouverte à la fois** : À propos, Configuration requise (avec comparaison à la config du PC), Avis des joueurs, Actus et patch notes.
- Encadré latéral : développeur, éditeur, date de sortie, langues, amis qui possèdent le jeu.
- **Acheter** ouvre un popup de sécurité (« le paiement se fait dans Steam ») avec les boutons **Annuler** et **Ouvrir dans Steam**. Il s'ouvre et se ferme en douceur.

## 3. Bibliothèque complète — `03-bibliotheque.dc.html`

- Titre, nombre de jeux, et recherche qui filtre la grille en direct.
- Filtres : Tous, Installés, Favoris, Récents, plus les collections Steam de l'utilisateur. Tri : A → Z, Temps de jeu.
- Grille de jaquettes 3:4 avec :
  - une étoile si le jeu est en favori ;
  - le **rang d'heures en chiffres romains** ;
  - le temps de jeu et l'état Installé / Non installé.
- Survol : la jaquette monte avec un liseré lunaire, et un seul bouton apparaît (**Jouer** ou **Installer**).

## 4. Profil — `04-profil.dc.html`

- Grand avatar rond. Le **niveau du compte est un croissant de lune** qui sert aussi de jauge d'XP, avec le chiffre dans le creux, des étoiles et une **pluie lunaire** qui tombe en dessous.
- Pseudo, prénom, pays, statut.
- 4 stats avec icônes thématiques : jeux (manette), heures récentes (sablier), amis (silhouettes), badges (médaille).
- **Tes rangs de temps de jeu** : les 10 paliers alignés avec le nombre de jeux dans chacun. Cliquer un rang affiche les jeux qui l'ont atteint.
- Activité récente : cartes avec le temps de jeu, le rang et le croissant des succès.
- Badges.
- Un seul bouton, **Modifier dans Steam**, car l'édition du profil se fait dans Steam.

## 5. Liste de souhaits — `05-liste-de-souhaits.dc.html`

- Bandeau « X de tes souhaits sont en promo ».
- Tri : Mon ordre, Promos d'abord, Prix.
- Une ligne par jeu : image, titre, date de sortie, évaluations, tags, prix et **Acheter** (blanc plein si le jeu est en promo, en contour sinon), et une croix pour retirer le jeu, visible au survol.

## 6. Classements — `06-classements.dc.html`

- Compteur « En ligne maintenant » avec un point qui pulse, le pic du jour et une courbe sur 24 h.
- Onglets **Meilleures ventes** et **Les plus joués**.
- Le n°1 a une grande carte avec un énorme « 1 » lumineux. Les places 2 à 5 sont dans une liste sobre, avec un lien « Voir le top 100 ».

## Pages encore à concevoir (dans la même DA)

- Panneau Amis complet (si besoin au-delà du panneau latéral)
- Téléchargements en cours
- Paramètres
- Écran de connexion (Se connecter avec Steam)
