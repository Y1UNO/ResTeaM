# Prompts pour Claude Code — une conversation par étape

Même méthode que pour Kayro : on fait une étape par conversation et on vérifie dans l'app avant de passer à la suivante.

> **Temps de travail : [À REMPLIR par Tom avant de lancer — ex. « 1 h », « une journée », ou « pas de limite : tu peux y passer la journée entière »]**
> Recopie cette ligne en tête de chaque prompt.

---

## Étape 0 — Lecture du kit et plan

```
Temps de travail : [À REMPLIR]

Lis entièrement le dossier ResTeaM_kit : README.md, DA.md, PAGES.md, FONCTIONNALITES.md, puis chaque fichier de design/ (surtout 01-accueil-reference-V3.dc.html, qui est la référence de la DA) et les captures de references/.
Ne code rien encore. Rends-moi :
1. ton résumé du projet en 10 lignes,
2. l'architecture proposée (Tauri 2 + React + TypeScript, comme Kayro) : dossiers, gestion d'état, cache, couche API Steam,
3. le découpage en étapes,
4. les questions qui te bloquent.
```

## Étape 1 — Socle de l'app et DA

```
Temps de travail : [À REMPLIR]

Crée le projet Tauri 2 + React + TS. Mets en place la DA de DA.md : couleurs, polices (Space Grotesk, Inter), fond, fumée monochrome animée, barre de navigation transparente à gauche avec le routage entre les pages (pages vides pour l'instant).
Reproduis fidèlement le rendu de design/01-accueil-reference-V3.dc.html pour la barre et le fond.
```

## Étape 2 — Connexion Steam et données

```
Temps de travail : [À REMPLIR]

Implémente la connexion Steam OpenID et une couche API propre (FONCTIONNALITES.md) : profil, bibliothèque, joué récemment, succès, niveau/badges, amis, actus. Ajoute le cache, la gestion des profils privés et la lecture locale des jeux installés (libraryfolders.vdf + appmanifest). La clé Web API est saisie dans les paramètres, jamais dans le code.
```

## Étape 3 — Accueil (référence V3)

```
Temps de travail : [À REMPLIR]

Construis l'accueil exactement comme design/01-accueil-reference-V3.dc.html, avec les vraies données : hero avec image floutée, jaquette 3D, jauge d'heures à rangs, croissant de succès, ruban, panneau amis repliable, bouton Jouer (steam://rungameid).
Ajoute les patch notes : clic sur la jaquette, déploiement animé et repli animé, tri automatique par catégories.
```

## Étape 4 — Bibliothèque complète

```
Temps de travail : [À REMPLIR]

Construis la page de design/03-bibliotheque.dc.html : recherche en direct, filtres (dont les collections Steam), tris, badges de rang, Jouer/Installer au survol.
```

## Étape 5 — Magasin et fiche d'un jeu

```
Temps de travail : [À REMPLIR]

Construis l'onglet Magasin de l'accueil et la fiche de design/02-fiche-jeu.dc.html avec appdetails, appreviews et featured. Ajoute le bloc d'achat unique, le popup de sécurité, puis steam://store. Fais les sections dépliables et la comparaison de la config requise avec le PC.
```

## Étape 6 — Profil

```
Temps de travail : [À REMPLIR]

Construis design/04-profil.dc.html : croissant de niveau avec jauge d'XP et pluie lunaire, stats avec icônes, rangs de temps de jeu cliquables, activité récente, badges.
```

## Étape 7 — Liste de souhaits et classements

```
Temps de travail : [À REMPLIR]

Construis design/05-liste-de-souhaits.dc.html et design/06-classements.dc.html.
```

## Étape 8 — Amis (Rejoindre / Ajouter) et finitions

```
Temps de travail : [À REMPLIR]

Branche Rejoindre (joinlobby / connect) et Ajouter un ami (steam://friends/add). Vérifie toutes les animations de DA.md (aucune fermeture instantanée), les états vides, les erreurs réseau et les performances.
```

## Étape 9 — Vérification sécurité

```
Temps de travail : [À REMPLIR]

Fais un audit de sécurité : stockage de la clé API, aucune donnée sensible dans les logs, liens steam:// validés, pas d'injection via les textes de l'API (patch notes, descriptions).
```
