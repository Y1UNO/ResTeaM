# ResTeaM — présentation du projet

> Nom temporaire. Projet perso de Tom (YIUNO), après Kayro.

## L'idée en une phrase

Une app Windows qui fait **tout ce qu'on fait au quotidien sur Steam** (bibliothèque, lancer ses jeux, magasin, liste de souhaits, profil, amis en ligne), mais avec une interface **beaucoup plus belle, sobre et centrée sur le jeu**. ResTeaM est une **vitrine** : elle s'appuie sur le compte Steam de l'utilisateur et sur le client Steam installé sur le PC, sans le remplacer.

## Ce que l'app fait

| Domaine | Ce qu'on voit / fait | Comment |
|---|---|---|
| Connexion | Se connecter avec son compte Steam | Steam OpenID (jamais de mot de passe dans l'app) |
| Bibliothèque | Tous ses jeux, temps de jeu, succès, installés ou non | Steam Web API + lecture locale des fichiers Steam |
| Jouer / installer | Bouton Jouer, Installer | Liens `steam://rungameid/<id>`, `steam://install/<id>` |
| Magasin | Accueil, fiches de jeux, promos, recherche | Endpoints du store (`appdetails`, `featured`, `featuredcategories`, recherche) |
| Achat | Bouton **Acheter** → popup de sécurité → ouvre la page dans Steam | `steam://store/<id>` (aucun paiement dans l'app) |
| Liste de souhaits | Ses souhaits, promos mises en avant | Wishlist du compte |
| Classements | Meilleures ventes, plus joués, joueurs en ligne | Endpoints publics Steam |
| Profil | Avatar, niveau + XP, badges, activité récente, rangs d'heures | Web API (`GetPlayerSummaries`, `GetBadges`, `GetRecentlyPlayedGames`…) |
| Amis | Qui est en ligne, à quoi il joue, **Rejoindre**, **Ajouter un ami** | `GetFriendList` + `GetPlayerSummaries`, `steam://joinlobby/…`, `steam://connect/…`, `steam://friends/add/<id>` |
| Patch notes | Clic sur la grande jaquette → patch notes déployées, **triées automatiquement** | `ISteamNews/GetNewsForApp` + tri par mots-clés |

**Volontairement absent :** le chat / les messages, la partie « communauté » sociale, le paiement dans l'app, le téléchargement des jeux sans Steam.

## Contenu de ce dossier

```
ResTeaM_kit/
├── README.md              ← ce fichier (présentation)
├── DA.md                  ← direction artistique : couleurs, typo, effets, règles
├── PAGES.md               ← chaque écran en détail + interactions
├── FONCTIONNALITES.md     ← API, liens steam://, rangs d'heures, tri des patch notes
├── PROMPTS.md             ← étapes de travail pour Claude Code, une conversation à la fois
├── design/                ← les maquettes validées (source HTML/CSS/JS)
│   ├── 01-accueil-reference-V3.dc.html   ← POINT D'ANCRAGE de toute la DA
│   ├── 02-fiche-jeu.dc.html
│   ├── 03-bibliotheque.dc.html
│   ├── 04-profil.dc.html
│   ├── 05-liste-de-souhaits.dc.html
│   ├── 06-classements.dc.html
│   └── _archives/         ← anciennes pistes (pour mémoire, ne pas suivre)
└── references/
    ├── steam-actuel/      ← captures de Steam aujourd'hui : ce qu'on veut dépasser
    └── inspiration/       ← l'inspiration « hero sobre » (à ne PAS copier telle quelle)
```

## Lire les maquettes

Les fichiers `design/*.dc.html` sont des maquettes interactives faites sur un canevas de design. Ils contiennent **tout le visuel en clair** : la mise en page et les styles sont en `style="…"` inline, les animations dans le bloc `<style>` du `<helmet>`, et la logique d'interaction dans la classe `Component` en bas de chaque fichier (états, clics, données d'exemple).

Ils ne s'ouvrent pas tels quels dans un navigateur, parce qu'ils ont besoin du runtime du canevas (`support.js`). **Ils servent de référence de design à reproduire fidèlement**, pas de code à copier-coller.

Toutes les images de jeux y sont des **dégradés de couleur** : dans l'app, ce seront les vraies images Steam (key art, jaquettes, captures).

## Stack conseillée

La même que Kayro : **Tauri 2 + React + TypeScript**. Ça permet de garder les mêmes habitudes et, plus tard, de partager du code (ResTeaM pourrait même devenir un module de Kayro).

## Points d'attention

- **Clé Steam Web API** : stockée côté app (jamais dans le code source publié), avec cache des réponses pour rester sous les limites (environ 100 000 appels par jour).
- **Profils privés** : si le profil de l'utilisateur ou d'un ami est privé, afficher un état vide propre, sans planter.
- **Marque** : ne pas utiliser le logo Steam. Mettre « Powered by Steam » quelque part. Le nom ResTeaM contient presque « Steam », ce qui est OK pour un usage perso ; à changer avant toute diffusion publique.
- **Sécurité** : aucun identifiant ni moyen de paiement ne transite par l'app.
