# ResTeaM — Plan (étape 0)

> Écrit le 8 novembre 2026, après lecture complète de `ResTeaM_kit` (docs, 6 maquettes, captures).
> Ce fichier sert de mémoire entre les conversations : chaque étape commence par le relire.

## 1. Résumé du projet

1. ResTeaM est une app Windows qui sert de **vitrine** à Steam : elle s'appuie sur le compte et le client Steam, sans les remplacer.
2. On y retrouve l'usage quotidien : bibliothèque, Jouer / Installer, magasin, fiche d'un jeu, liste de souhaits, classements, profil, amis en ligne et patch notes.
3. Tout passe par Steam : connexion OpenID (sans mot de passe), Web API avec la clé de l'utilisateur, endpoints publics du magasin, lecture des fichiers locaux de Steam et liens `steam://`.
4. Aucun paiement dans l'app : **Acheter** affiche un popup de sécurité, puis ouvre `steam://store/<id>`.
5. Volontairement absents : chat, partie communauté, paiement, téléchargement sans Steam.
6. Direction artistique « Nocturne · Clair de lune » :
   - fond `#09090A` ;
   - une seule couleur d'accent, `#EEF2FF`, réservée aux interactions ;
   - polices Space Grotesk et Inter ;
   - verre fumé et fumée monochrome.
7. Éléments signature :
   - hero avec l'image du jeu floutée ;
   - jaquette inclinée en 3D qui se déplie en patch notes ;
   - croissants de lune pour les succès et le niveau ;
   - jauge d'heures à 9 paliers ;
   - pluie lunaire sur le profil.
8. Système de rangs par jeu, de Novice à Éternel (0 h → 10 000 h). Il apparaît dans le hero, sur les jaquettes et dans le profil.
9. Les patch notes viennent de `GetNewsForApp`. On les nettoie, puis on les trie automatiquement en Nouveau, Équilibrage, Performances, Correctifs et Autre.
10. Stack : Tauri 2 + React + TypeScript, comme Kayro. On avance une étape par conversation et tu vérifies chaque étape dans l'exe de production.

## 2. Architecture proposée

### Principe clé : tout le réseau passe par Rust

Le WebView n'appelle **jamais** Steam directement. Trois raisons :
- `store.steampowered.com` ne renvoie pas d'en-têtes CORS, donc les appels depuis le WebView seraient bloqués ;
- la clé API ne doit jamais se retrouver dans le JavaScript ;
- le cache et le respect des quotas sont plus simples à gérer à un seul endroit.

Le React appelle des commandes Tauri typées. Rust fait les requêtes (`reqwest`), gère le cache et renvoie du JSON propre.

### Dossiers

```
Vitrine Steam/
├── PLAN.md                 ← ce fichier
├── kit/                    ← copie de ResTeaM_kit (référence de design)
├── src-tauri/
│   └── src/
│       ├── lib.rs, main.rs
│       ├── commands.rs     ← commandes exposées au front
│       ├── secrets.rs      ← clé API dans le Gestionnaire d'identifiants Windows (crate keyring)
│       ├── cache.rs        ← SQLite (rusqlite) : clé, JSON, date d'expiration
│       └── steam/
│           ├── auth.rs     ← OpenID : serveur local 127.0.0.1 + navigateur système + vérification
│           ├── webapi.rs   ← ISteamUser, IPlayerService, ISteamUserStats, ISteamNews…
│           ├── store.rs    ← appdetails, featured, appreviews, liste de souhaits, classements
│           ├── news.rs     ← nettoyage BBCode/HTML + tri des patch notes (tests unitaires)
│           ├── local.rs    ← libraryfolders.vdf, appmanifest_*.acf, collections et favoris
│           └── links.rs    ← construction et validation stricte des liens steam://
└── src/
    ├── styles/             ← tokens.css (couleurs, rayons, ombres de DA.md), animations.css
    ├── app/                ← routes, Layout (barre de gauche, fond fumé, dock Amis)
    ├── pages/              ← Accueil, Bibliothèque, FicheJeu, Profil, Souhaits,
    │                         Classements, Connexion, Paramètres, Téléchargements
    ├── components/         ← Croissant, JaugeRangs, BadgeRang, PanneauPatchNotes,
    │                         PopupAchat, Jaquette, Ruban, Smoke…
    ├── api/                ← appels invoke() typés + hooks TanStack Query
    └── lib/                ← rangs.ts, format.ts (nombres et dates en français)
```

### Gestion d'état

- **Données Steam** : TanStack Query. Il gère le chargement, les erreurs, le rafraîchissement et l'invalidation.
- **État de l'interface et session** : Zustand. Il gère le SteamID, l'onglet en cours et les préférences.
- **Routage** : React Router.

### Cache (côté Rust, SQLite dans le dossier de données de l'app)

| Donnée | Durée de vie |
|---|---|
| Amis, statuts | 60 s |
| Joué récemment, actus | 15–30 min |
| Bibliothèque (GetOwnedGames) | 1 h |
| Fiches magasin, avis | 24 h |
| Schéma des succès | 7 jours |

- En cas d'erreur réseau, on renvoie la dernière valeur en cache avec un drapeau « hors ligne ».
- Images : URL du CDN Steam (`library_600x900`, `library_hero`, `header`), mises en cache par le WebView. Si une image manque (fréquent pour `library_600x900`), on affiche le dégradé de la maquette.

### Ce qui est confirmé sur ton PC

- Node 24, npm 11, Rust 1.99 et Git sont installés.
- Steam est dans `C:\Program Files (x86)\Steam`. `libraryfolders.vdf` et les `appmanifest` sont lisibles.
- **Les favoris et les collections sont lisibles localement** dans `userdata/<id>/config/cloudstorage/cloud-storage-namespace-1.json` (`user-collections.favorite`, `user-collections.uc-…`). La Web API ne les fournit pas, mais on peut quand même faire les filtres Favoris et Collections.

## 3. Points techniques à connaître (limites de Steam)

- **Liste de souhaits** :
  - on peut la **lire** via `IWishlistService/GetWishlist` (public) ;
  - on ne peut **pas** y ajouter ni en retirer un jeu sans une session web Steam (cookies), que l'app ne doit pas manipuler ;
  - conséquence : l'étoile de la fiche et la croix de retrait ouvrent la page du jeu dans Steam ;
  - variante : on masque la croix.
- **Rejoindre** : il n'apparaît que si `GetPlayerSummaries` renvoie `lobbysteamid` ou `gameserverip`, ce qui est rare en pratique. Le bouton sera donc souvent absent, ce qui est normal.
- **Classements** :
  - Meilleures ventes : `IStoreTopSellersService/GetWeeklyTopSellers` ;
  - Les plus joués : `ISteamChartsService/GetMostPlayedGames` ;
  - **à vérifier à l'étape 7** : le total « En ligne maintenant », le pic et la courbe 24 h n'ont pas d'API officielle évidente. Solution de repli : chiffre seul, ou courbe construite par l'app au fil des heures.
- **Configuration requise vs ton PC** :
  - Steam renvoie les exigences en HTML libre ;
  - comparaison fiable : OS, mémoire vive, espace disque ;
  - comparaison indicative seulement : processeur et carte graphique.
- **Téléchargements** : pas d'API. On lit l'état et la progression dans les `appmanifest` (`StateFlags`, `BytesDownloaded`/`BytesToDownload`).
- **Badge « Nouveau patch »** : il s'affiche si la dernière actu du jeu est plus récente que ta dernière ouverture des notes (date gardée localement).
- **Profil** : avec ta propre clé, l'API renvoie tes données même si le profil est privé. Pour un ami au profil privé, on affiche un état vide propre.

## 4. Découpage en étapes

On garde les étapes de `PROMPTS.md`, avec trois ajustements :
- l'étape 2 est coupée en deux ;
- les écrans non dessinés sont placés aux étapes où on en a besoin ;
- chaque étape se termine par un exe de production à tester.

| # | Contenu | Vérification dans l'exe |
|---|---|---|
| 1 | Projet Tauri 2 + React + TS, tokens de DA, polices embarquées (pas de Google Fonts en ligne), fond fumé, barre de gauche, routage vers des pages vides | La barre et le fond sont identiques à la maquette 01 |
| 2a | Écran Connexion (à dessiner dans la DA), OpenID, page Paramètres avec saisie de la clé API (Gestionnaire d'identifiants Windows), client Web API, cache SQLite | Connexion réussie, pseudo et avatar affichés |
| 2b | Lecture locale : jeux installés, collections, favoris, progression des téléchargements. Commandes Bibliothèque, Succès, Niveau, Badges, Amis, Actus | Données réelles visibles dans une page de test |
| 3 | Accueil V3 avec les vraies données + patch notes animées et triées | Jouer lance bien le jeu |
| 4 | Bibliothèque complète | Filtres, collections, Jouer/Installer |
| 5 | Onglet Magasin de l'accueil, fiche d'un jeu, popup d'achat, comparaison de config | « Ouvrir dans Steam » ouvre la bonne page |
| 6 | Profil | Croissant de niveau, rangs cliquables |
| 7 | Liste de souhaits + Classements | Promos et classements réels |
| 8 | Amis (Rejoindre, Ajouter), page Téléchargements, états vides, erreurs réseau, toutes les animations de fermeture | Mode hors ligne propre |
| 9 | Audit de sécurité | Rapport + corrections |

## 5. Décisions (8 novembre 2026)

| Sujet | Décision |
|---|---|
| Temps de travail | Pas de limite par étape |
| Liste de souhaits (étoile, croix) | Tom n'a pas tranché. Choix retenu : les deux **ouvrent la page du jeu dans Steam** (`steam://store/<id>`), comme Acheter, avec une infobulle « Se gère dans Steam » |
| Logo | « Lune à engrenages » (8 nov. 2026), sources dans `assets-src/logo/`. Logo animé en ligne en haut de la barre (`src/components/Logo.tsx`), icône de l'app et du raccourci du Bureau. **L'animation tourne toujours : pas d'option pour la couper** (même avec « réduire les animations » de Windows) |
| Avatar du profil | En bas de la barre de navigation sur toutes les pages (comme PAGES.md et la maquette 04) |
| Kayro | On ne s'en occupe pas pour l'instant |
| Écran | 1440p (2560 × 1440). Fenêtre maximisée par défaut, taille minimale 1280 × 800. Mise en page calée sur les maquettes (1440 px) et qui s'étire proprement jusqu'à 2560 px |
| Kit | Copié dans `kit/` (référence de design, versionnée) |
| Git | Dépôt local créé, branche `main` |
| Fenêtre | **Sans cadre Windows** (comme Steam) : bande invisible en haut pour déplacer la fenêtre, boutons Réduire / Agrandir / Fermer dessinés dans la DA (`src/app/TitleBar.tsx`) |
| Accès aux Paramètres | **Clic sur le logo → menu → Paramètres** (`src/app/LogoMenu.tsx`). « Se déconnecter » s'ajoutera dans ce menu en 2a |
| Clé API | Tom la saisit lui-même dans l'app (Paramètres). Elle n'est jamais écrite dans le code, le dépôt, la mémoire ou une conversation |

### Encore ouvert

- **Clé Steam Web API** : à avoir pour l'étape 2a (steamcommunity.com/dev/apikey).
- **GitHub** : pousser le dépôt sous YIUNO ou rester en local ?

## 6. Journal des étapes

### Étape 1 — Socle et DA (8 novembre 2026)

- Projet Tauri 2 + React 19 + TypeScript + Vite, routage React Router en mode hash (`src/app/router.tsx`, chemins dans `src/app/paths.ts`).
- DA : `src/styles/tokens.css` (couleurs, rayons, ombres, courbes, mesures de mise en page), `animations.css` (fumée, zoom du hero, montées), `base.css`.
- Polices embarquées via `@fontsource` (Space Grotesk 500/700, Inter 400–700), aucun appel réseau.
- Composants : `Smoke` (variantes `hero` = maquettes 01/02, `top` = maquettes 03/05/06), `HeroBackdrop` (image floutée + voile + fumée ; dégradé de remplacement de la maquette tant qu'il n'y a pas d'image), `icons.tsx`.
- Barre de gauche `src/app/NavRail.tsx` : valeurs de la maquette 01 ; logo « Lune à engrenages » animé ; avatar en bas (silhouette tant qu'on n'est pas connecté, liseré lunaire quand le Profil est ouvert). Ctrl+K ouvre la Recherche.
- Bibliothèque (rail) → Accueil `/` ; `/bibliotheque` (page complète, étape 4) allume aussi Bibliothèque. Magasin et `/jeu/:appId` allument Magasin.
- Fenêtre : maximisée, minimum 1280 × 800, fond `#09090A` dès l'ouverture, thème sombre. CSP stricte (images Steam autorisées pour la suite).
- Icône d'app : `npx tauri icon assets-src/logo/resteam-logo-1024.png`, puis copier `assets-src/logo/resteam-logo.ico` sur `src-tauri/icons/icon.ico` et supprimer `icons/android` et `icons/ios`. **Ensuite, toucher `src-tauri/build.rs`** : sinon Cargo garde l'ancienne icône dans l'exe.
- Construire l'exe : `npm run build:exe` (ferme l'ancienne version ouverte, compile, met à jour le raccourci `ResTeaM` du Bureau) → `src-tauri/target/release/ResTeaM.exe`. Installateur NSIS : `npm run build:installer`.
- Kit resynchronisé : `kit/pages-autonomes/` (maquettes ouvrables sans canevas, servies par la config `maquettes` de `.claude/launch.json`) et `kit/captures/` (rendus attendus). Comparaison mesurée : barre et fond identiques à la page 01. Seul écart voulu : le logo « Lune à engrenages » à la place du carré « R » des maquettes.
- À faire en 2a : grand logo animé sur l'écran de connexion / chargement (`<Logo size={…} />`). Pas d'option « Animer le logo » (refusée par Tom).

### Étape 2a — Connexion, clé API, client Web API, cache (8 novembre 2026) — validée par Tom dans l'exe

- **Rust** (`src-tauri/src/`) :
  - `erreur.rs` : erreurs `{ code, message }` en français, sans URL ni clé ;
  - `session.rs` : SteamID dans `session.json` ;
  - `secrets.rs` : clé dans le Gestionnaire d'identifiants Windows (`keyring` v3, service `ResTeaM`) ;
  - `cache.rs` : SQLite `cache.sqlite`, TTL et repli hors ligne ;
  - `steam/auth.rs` : OpenID avec serveur `127.0.0.1`, jeton d'état, `check_authentication` et SteamID strict ;
  - `steam/webapi.rs` : `GetPlayerSummaries` ;
  - `commandes.rs` : `session_lire`, `connexion_steam`, `connexion_annuler`, `deconnexion`, `cle_etat`, `cle_enregistrer`, `cle_supprimer`, `ouvrir_page_cle_api`, `joueur_moi`.
- **TLS** : `reqwest` 0.13 avec `native-tls` (Schannel de Windows), pour éviter `aws-lc-rs` qui demande CMake et NASM.
- **Liens externes** : uniquement via des commandes Rust à adresse fixe. La permission `opener:default` est retirée du front.
- **Tests** : `cargo test` lance 8 tests. `cargo test -- --ignored` lance un vrai appel à Steam avec une clé factice, qui doit être refusée.
- **Front** :
  - `src/api/` : appels typés, TanStack Query, et `apercu.ts` (faux back-end, seulement hors de l'exe, pour vérifier les écrans dans le navigateur) ;
  - `src/app/session.ts` : Zustand, statut `chargement` / `deconnecte` / `sans-cle` / `pret` ;
  - `Garde.tsx` ;
  - écrans `src/ecrans/` : Chargement, Connexion, Clé API ;
  - page `Parametres.tsx` ;
  - menu du logo avec Paramètres et Se déconnecter ;
  - vrai avatar en bas de la barre.
- **Piège corrigé** : les conteneurs avec de la fumée qui déborde utilisent `overflow: clip`, pas `hidden`. Sinon, le focus d'un champ fait défiler le contenu.

### Étape 2b — Lecture locale et données du compte (8 novembre 2026)

- **Lecture locale** :
  - `steam/vdf.rs` : parseur KeyValues avec tests ;
  - `steam/local.rs` : dossier Steam via le registre (`winreg`), `libraryfolders.vdf` et `appmanifest_*.acf` (état depuis `StateFlags`, progression `BytesDownloaded/BytesToDownload`) ;
  - favoris et collections dans `userdata/<SteamID64 − 76561197960265728>/config/cloudstorage/cloud-storage-namespace-1.json`. Une collection est dynamique si son `filterSpec` a une recherche ou des options ;
  - le redistribuable 228980 est ignoré.
- **Web API** (`steam/webapi.rs`) :
  - GetOwnedGames, GetRecentlyPlayedGames, GetBadges (niveau, XP, badges) ;
  - GetFriendList + GetPlayerSummaries par paquets de 100 ;
  - GetPlayerAchievements + GetSchemaForGame (en français). Un 400 signifie « pas de succès » et donne `null` ;
  - GetNewsForApp, limité à `feeds=steam_community_announcements` (sinon la presse étrangère se mélange aux patch notes).
  - Le code HTTP 401 donne l'erreur `prive`, le 403 donne `cle_refusee`.
- **Bibliothèque** (`steam/bibliotheque.rs`) : jeux possédés croisés avec l'installation, les favoris et les collections.
- **Commandes** : `steam_local`, `jeux_installes` (sans cache, relue toutes les 3 s pour les téléchargements), `collections`, `bibliotheque`, `recemment_joues`, `niveau_badges`, `amis`, `succes_jeu(appId)`, `actus_jeu(appId)`. Les TTL sont ceux de la section 2.
- **Front** :
  - `src/lib/rangs.ts` : rangs et jauge à 9 segments ;
  - `src/lib/format.ts` : heures, tailles, dates relatives et statut, en français ;
  - hooks dans `src/api/requetes.ts` ;
  - **page de test provisoire** `/donnees` (menu du logo → « Données Steam (test) »), à retirer quand les vrais écrans seront faits.
- **Tests** : `cargo test` lance 20 tests. `cargo test donnees_reelles -- --ignored --nocapture` interroge le vrai compte avec la clé enregistrée et n'affiche que des nombres. Résultat : 81 jeux, niveau 11, 6 badges, 24 amis.

## 7. Plan détaillé — étape 2a (fait, voir le journal)

Écrit le 8 novembre 2026, à la fin de l'étape 1. **But** : se connecter avec Steam, enregistrer la clé API, afficher le vrai pseudo et le vrai avatar en bas de la barre.

### Côté Rust (`src-tauri/src/`)

1. **Dépendances** : `reqwest` (rustls, json), `rusqlite` (bundled), `keyring` (Gestionnaire d'identifiants Windows), `url`, `thiserror`, `rand`. Le petit serveur local est fait à la main avec `std::net::TcpListener`.
2. **`steam/auth.rs`, OpenID** :
   - ouvre un serveur sur `127.0.0.1:<port libre>` ;
   - ouvre le navigateur système sur `https://steamcommunity.com/openid/login` (`checkid_setup`, `return_to=http://127.0.0.1:<port>/retour?etat=<aléa>`) ;
   - à l'arrivée sur `/retour`, vérifie dans l'ordre : l'`etat`, le `return_to`, puis `check_authentication` auprès de Steam (`is_valid:true`) ;
   - extrait le SteamID64 avec un motif strict `^https://steamcommunity\.com/openid/id/(\d{17})$` ;
   - affiche dans le navigateur une page « Connexion réussie, tu peux fermer cet onglet » dans la DA ;
   - abandonne au bout de 5 minutes, ou sur Annuler.
3. **`secrets.rs`** : la clé API vit dans le Gestionnaire d'identifiants Windows (service `ResTeaM`). Commandes `cle_enregistrer` (format 32 caractères hexadécimaux, puis appel test), `cle_etat` et `cle_supprimer`. **La clé ne repart jamais vers le React.**
4. **`steam/webapi.rs`** : client Web API qui ajoute la clé côté Rust. Erreurs typées : clé absente, clé refusée (403), trop de requêtes (429), réseau. En 2a, seul `GetPlayerSummaries` est branché.
5. **`cache.rs`** : SQLite `cache.sqlite` dans le dossier de données de l'app (clé, JSON, date d'expiration, date de récupération). En cas d'erreur réseau, on renvoie la dernière valeur avec un drapeau `horsLigne`.
6. **Session** : le SteamID (non secret) est gardé dans `session.json`, pour rester connecté au redémarrage. Commandes `session_lire` et `deconnexion` (efface la session et le cache ; la clé est gardée, sauf demande explicite).

### Côté React (`src/`)

1. **TanStack Query** (données Steam) et **Zustand** (session), avec les appels `invoke()` typés dans `src/api/`.
2. **Écran Connexion** (à dessiner dans la DA, sans barre de gauche) : fumée, **grand logo animé** (~160 px), titre, une phrase, un seul bouton **Se connecter avec Steam**. États prévus : attente du navigateur (avec Annuler), erreur, succès.
3. **Clé API** : un écran d'accueil juste après la première connexion, s'il n'y a pas encore de clé. Il contient :
   - le lien « Obtenir ma clé », qui ouvre `steamcommunity.com/dev/apikey` dans le navigateur ;
   - un champ masqué ;
   - Enregistrer, avec un test immédiat de la clé.
4. **Page Paramètres** : remplacer la clé, la supprimer, se déconnecter.
5. **Barre** : vrai avatar (`avatarfull`, autorisé par la CSP via `*.steamstatic.com`) et pseudo dans l'infobulle.
6. Garde de route : sans session → Connexion ; sans clé → écran Clé API.

### Vérification dans l'exe

- Connexion réussie, puis pseudo et avatar visibles en bas de la barre.
- Fermer et rouvrir l'app : on reste connecté.
- Clé fausse : message clair, rien ne plante.
- Couper Internet : l'avatar en cache s'affiche, avec un drapeau « hors ligne ».

### Décidé

- **Accès aux Paramètres** : clic sur le logo, puis Paramètres (menu déjà en place). Ajouter « Se déconnecter » dans ce menu.
- La barre de titre est invisible : sur l'écran Connexion (sans barre de gauche), garder les boutons de fenêtre et la bande de déplacement (`<TitleBar />`).
- Étape 3 : le panneau Amis de la maquette est à `top: 24px` ; le descendre sous les boutons de fenêtre (32 px).
