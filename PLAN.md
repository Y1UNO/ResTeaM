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
| Fond des jeux (hero) | **Affiche nette, resserrée à droite** (visuel `library_hero_2x`, 3840 px), jamais sous la barre de gauche. Bords gauche et bas fondus dans une **brume** douce. Derrière : des **lueurs aux couleurs de l'affiche** (3 teintes extraites de l'image), qui passent sous la barre et continuent sous le ruban. Écart voulu par rapport à DA.md (« image floutée », « fumée jamais colorée ») |
| Installation | **Fenêtre de ResTeaM, sans celle de Steam** (accord de Tom) : choix du disque avec l'espace libre réel, raccourcis Bureau et menu Démarrer. Ensuite, l'app écrit `appmanifest_<id>.acf` (StateFlags 1026) dans la bibliothèque choisie et redémarre Steam en arrière-plan (`-shutdown`, puis `-silent`). Steam télécharge seul. **Si un jeu tourne, l'installation attend sa fermeture** (9 nov., choix de Tom), puis Steam redémarre caché. Refusé si le jeu est déjà installé, si le dossier n'est pas une bibliothèque Steam ou si le jeu n'est pas sur le compte |
| Désinstallation | **ResTeaM supprime lui-même** (9 nov., choix de Tom), après une confirmation dans la DA : Steam est fermé, puis l'app supprime le dossier du jeu (vérifié dans `steamapps\common`), le manifeste, le téléchargement partiel, le cache de shaders, le Workshop et les raccourcis `.url`. Steam est ensuite relancé caché. Attend la fin du jeu en cours |
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

### Étape 2b — Lecture locale et données du compte (8 novembre 2026) — validée par Tom dans l'exe

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
- **Tests** : `cargo test` lance 16 tests, plus 4 ignorés par défaut qui touchent au réseau ou à ce PC. `cargo test donnees_reelles -- --ignored --nocapture` interroge le vrai compte avec la clé enregistrée et n'affiche que des nombres. Résultat : 81 jeux, niveau 11, 6 badges, 24 amis.

### Étape 3 — Accueil réel et patch notes (8 novembre 2026)

- **Images** (`steam/images.rs`) : `IStoreBrowseService/GetItems` (sans clé) donne les vraies adresses `library_capsule` / `library_hero` / `header`, avec empreinte pour les jeux récents. Repli sur les adresses classiques `…/steam/apps/<id>/library_600x900.jpg`. Cache d'une semaine par jeu (`Cache::frais` / `Cache::ranger`).
- **Liens** (`steam/liens.rs`) : le front envoie une action (`jouer`, `installer`, `magasin`, `rejoindreLobby`, `rejoindreServeur`, `amis`, `page`). Le Rust construit et valide le lien `steam://` : chiffres, IP:port, pages HTTPS des domaines Steam uniquement.
- **Patch notes** (`steam/notes.rs`) :
  - nettoyage BBCode et HTML (images et vidéos retirées, entités décodées) ;
  - sous-listes rattachées à leur point ;
  - sous-titres détectés (« Enemies: », « MAP CHANGE ») et puces tapées à la main retirées ;
  - tri par mots-clés FR/EN, avec la priorité Correctifs > Performances > Équilibrage > Nouveau, et le titre de section en repli ;
  - les paragraphes d'intro sont écartés quand l'annonce a de vraies listes ;
  - version extraite du titre.
  - Choix de l'annonce : la plus récente étiquetée `patchnotes`, sinon la plus récente.
- **Commandes** : `images_jeux(appIds)`, `steam_lien(action)`, `patch_notes(appId)`.
- **Front** :
  - `src/pages/Accueil.tsx` et `src/pages/accueil/` : `Hero`, `PanneauPatchNotes`, `Ruban`, `PanneauAmis`, `accueil.css` (animations de la maquette : entrée, sortie et retour de la jaquette, dépliage et repliage du panneau) ;
  - composants `JaugeHeures` et `Croissant` ;
  - `HeroBackdrop` précharge l'image et utilise un dégradé teinté d'après le nom en repli ;
  - `lib/images.ts` et `lib/notesVues.ts` (badge « Nouveau patch » : date de la dernière ouverture des notes, en localStorage).
- **Ruban** : les 8 derniers jeux lancés (sinon les plus joués), sans les jeux masqués. Un clic met le jeu en vedette.
- **Mise en page** : hauteur du hero `clamp(680px, 63vh, 900px)`, pour s'étirer sur l'écran 1440p. Interligne par défaut, comme les maquettes : mesuré au pixel près contre `01-accueil.html` à 1440 × 1080. Panneau Amis à `top: 40px`, sous les boutons de fenêtre.
- **Reste à faire** :
  - onglet Magasin de l'accueil (étape 5) ;
  - Rejoindre ne s'affiche que si Steam donne `lobbysteamid` + `gameid`, ou `gameserverip` ;
  - « Tous les jeux » et « Fiche du jeu » mènent encore à des pages vides (étapes 4 et 5).

### Étape 3 bis — Ambiance aux couleurs de l'affiche et suivi d'installation (8 novembre 2026)

- **Images** : le visuel du hero utilise `library_hero_2x` (3840 × 1240). Avant, `library_hero` (1920 px) étiré sur 2560 px était flou. La clé de cache passe à `images2:`.
- **Palette** (`src/lib/couleurs.ts`) : l'image est réduite à 48 × 16 sur un canvas (les en-têtes CORS de Steam l'autorisent). Les pixels trop sombres ou trop gris sont écartés, puis on garde 3 teintes dominantes (24 seaux de 15°), recalées en lueur. Cache en mémoire et en localStorage. Repli : teintes tirées du nom.
- **Ambiance** (`src/pages/accueil/Ambiance.tsx`) :
  - `Lueurs` : 3 taches floues et animées aux couleurs de la palette, en transition douce d'un jeu à l'autre, qui se fondent dans le noir sous le ruban ;
  - `Affiche` : de 12 % de la largeur jusqu'au bord droit, et 200 px sous le hero (derrière les jaquettes du ruban). Fondu sur 15 % à gauche et sur le dernier quart en bas. Brume teintée et grise très légère, animée par `brume-respire` (28 px et une respiration d'opacité, 28 à 34 s) ;
  - le voile du texte se fond vers le bas, et le hero de l'accueil est en `overflow: visible` (pas de couture).
- **Suivi d'installation** :
  - `SuiviInstallation.tsx` gère l'attente de Steam (barre indéterminée), puis le téléchargement (%, octets, vitesse lissée, temps restant) et la pause, avec un lien « Ouvrir dans Steam » (`steam://open/downloads`) ;
  - l'accueil fusionne l'état du disque dans le ruban (badge %, barre, « En cours ») et rafraîchit la bibliothèque à la fin ;
  - point qui pulse sur l'icône Téléchargements de la barre ;
  - `useJeuxInstalles` relit le disque toutes les 2 s tant qu'un téléchargement existe ;
  - le faux serveur d'aperçu simule une installation (4 s d'attente, puis 40 s de téléchargement).
- **À vérifier sur un vrai téléchargement** : Steam doit réécrire `BytesDownloaded` assez souvent dans l'`appmanifest`. Sinon, il faudra lire le dossier `steamapps/downloading/<id>`.

### Étape 3 ter — Installation sans la fenêtre de Steam (8 novembre 2026)

- **Rust** (`steam/installation.rs`) :
  - `disques()` : bibliothèques avec l'espace libre réel (`sysinfo`) ;
  - `jeu_en_cours()` : registre `RunningAppID` ;
  - `ecrire_manifeste()` (vérifications strictes) et `redemarrer_steam()` (processus détaché, sans poignée héritée) ;
  - `creer_raccourci()` : fichier `.url` vers `steam://rungameid` ;
  - `taille_depuis_config()` : « Espace disque : 15 GB » lu dans la fiche du magasin ;
  - `stats_systeme()` : compteurs réseau cumulés, écriture disque de `steam.exe`, espace libre par lecteur.
- **Commandes** : `options_installation`, `installer_jeu`, `stats_systeme`.
- **Front** :
  - `FenetreInstallation.tsx` : portail au-dessus de toute l'app, animations du popup de la maquette 02 ;
  - disques en boutons radio, avec une barre d'occupation et la place que prendra le jeu ; disque désactivé si l'espace manque ;
  - `SuiviInstallation` : « Steam redémarre », puis « Préparation » et « Téléchargement ». Il affiche le %, le temps restant, le débit réseau, celui de Steam, l'écriture disque et l'espace libre du lecteur.
- **Vrai test (Hades, 1145360, sur E:)** : réussi, sans aucune fenêtre Steam. Dans `logs/content_log.txt` : prise en compte à 23:07:30, téléchargement de 10,8 Go de 23:07:37 à 23:11:55, installé à 23:11:58.
- **Non vérifié** : Steam réécrit-il `BytesDownloaded` pendant le téléchargement ? En secours, si la valeur reste figée plus de 15 s, la progression est estimée d'après les octets reçus par la carte réseau (affichée avec « ≈ »).
- **Piège** : Steam relancé depuis un processus garde ses poignées stdout/stderr. D'où `Stdio::null()` au lancement.

### Étape 4 (en avance) — Bibliothèque, favoris au ruban (8 novembre 2026)

- **Ruban de l'accueil** : onglets « Reprendre » (8 derniers jeux lancés) et « Favoris » (favoris Steam, du plus récemment joué au moins récent). Une dernière carte « Tous les jeux » (icône à quatre fenêtres rondes) ouvre `/bibliotheque`.
- **Bibliothèque** (`src/pages/Bibliotheque.tsx`, maquette 03) :
  - recherche en direct ;
  - filtres Tous, Installés, Favoris, Récents (14 jours), puis un filtre par collection Steam statique ;
  - tris A → Z, Temps de jeu, Dernière partie ;
  - jaquettes 3:4 avec rang romain et étoile de favori, nom, heures et état ;
  - un seul bouton au survol : Jouer, Installer (fenêtre d'installation de ResTeaM) ou En cours ;
  - un clic sur la jaquette ouvre `/jeu/:id` (fiche, étape 5).
- **Visuel proposé** (Artifact « ResTeaM — Fenêtre d'installation », https://claude.ai/artifact/A6CQ7vnyucaZDve49MkpRf) :
  - lianes et petits engrenages aux couleurs du logo autour de la fenêtre, lueur teintée par la couleur du jeu ;
  - pendant le téléchargement, une liane pousse le long de la barre, avec un engrenage qui tourne à sa pointe ;
  - **pas encore intégré dans l'app** : en attente de l'avis de Tom.

### Étape 4 bis — Design d'installation de Tom intégré (9 novembre 2026) — validée par Tom dans l'exe

- Source : le design Claude Design de Tom (`ResTeaM_installation.zip` : choix, téléchargement, pastille, prêt à jouer).
- **Centre d'installation global** (`src/installation/`), monté dans `Layout` : il reste visible sur toutes les pages.
  - `store.ts` (zustand) : jeu suivi, phase `choix` → `lancement` (Steam redémarre) → `suivi`, fenêtre réduite ou non ;
  - `Lianes.tsx` : engrenages, feuilles, fleurs, vrilles, barre-liane qui se couvre de feuilles avec l'avancement, anneau de la pastille ;
  - `CentreInstallation.tsx` : fenêtre de choix (disque le plus libre par défaut, disques trop petits grisés), suivi (%, barre-liane, réseau, Steam, écriture disque, espace libre), pastille en bas à droite (« Continuer en arrière-plan ») ; la fenêtre revient seule quand le jeu est prêt, avec les fleurs écloses et le bouton Jouer ;
  - `mesures.ts` : débits du PC et estimation par le réseau si Steam ne réécrit pas l'avancement (le % est alors précédé de ≈).
- L'accueil et la bibliothèque ouvrent ce centre ; `FenetreInstallation.tsx` et `SuiviInstallation.tsx` sont supprimés.
- **Écart avec le design** : pas de bouton Pause. Steam ne peut pas être mis en pause depuis une autre app ; il est remplacé par « Ouvrir dans Steam ».

### Étape 5 — Magasin, fiche jeu, désinstallation, file Steam, bibliothèque fluide (9 novembre 2026) — validée par Tom dans l'exe

- **Bibliothèque plus fluide** (demande de Tom) :
  - tuiles en jaquette 600×900 (`jaquettePetite`) au lieu de 1200×1800 ;
  - plus de flou d'arrière-plan sur les tuiles ;
  - `content-visibility` : les tuiles hors de l'écran ne sont pas dessinées ;
  - tuiles mémorisées : seules celles dont l'état change se redessinent ;
  - images chargées par paquets de 100 en parallèle (avant : 200 jeux au plus) ;
  - fumée : le flou est porté par chaque nappe, il n'est plus recalculé à chaque image.
- **File Steam** (`src-tauri/src/steam/redemarrage.rs`) :
  - les installations et les désinstallations attendent la fin du jeu en cours (`RunningAppID`) ;
  - Steam est ensuite fermé, les fichiers supprimés, puis Steam relancé en `-silent` ;
  - si la grande fenêtre « Steam » s'ouvre quand même, elle est renvoyée dans la zone de notification (comme un clic sur ×), pendant 40 s. La fenêtre de connexion n'est jamais visée ;
  - la file est gardée dans le cache et reprend au prochain lancement de ResTeaM ;
  - commandes `file_steam`, `desinstaller_jeu`, `annuler_file_steam`.
- **Fenêtre d'installation** : état « En attente · partira dès que tu quittes <jeu> », avec un bouton « Annuler l'installation ». Correction d'une course : le statut restait sur « Steam démarre » quand le Rust répondait avant la fin de l'animation.
- **Fiche d'un jeu** (`src/pages/fiche/`, maquette 02) :
  - tags, titre, évaluations, date, démo ;
  - un seul bloc d'action :
    - jeu à toi : temps, rang, Jouer / Installer / Voir le téléchargement et la corbeille Désinstaller ;
    - jeu à acheter : prix, réduction, Acheter (popup de sécurité qui ouvre Steam), étoile qui ouvre Steam ;
  - bande-annonce (HLS lu par `hls.js`, chargé à la demande, sans worker) et 4 captures, avec fondu ;
  - sections dépliables, une seule ouverte :
    - À propos ;
    - Configuration requise comparée à ton PC : Windows, mémoire et disque comparés pour de vrai ; processeur et carte graphique à titre indicatif ;
    - Avis (toutes langues et en français) ;
    - Actus et patch notes ;
  - encadré : développeur, éditeur, sortie, langues, Metacritic, lien vers Steam.
- **Magasin** (`src/pages/Magasin.tsx`, onglet Magasin de la maquette 01) :
  - la vedette affiche le prix, la réduction et la fin de l'offre ;
  - « Acheter sur Steam » ouvre le popup, « Fiche du jeu » mène à la fiche ;
  - le ruban a trois onglets : Offres, Meilleures ventes, Nouveautés.
- **Rust** :
  - `magasin.rs` : `appdetails`, les avis via `GetItems` (la route `appreviews` redirige maintenant vers l'accueil du magasin) et `featuredcategories` ;
  - `pc.rs` : Windows, mémoire, processeur, carte graphique et sa mémoire (registre), espace libre ;
  - cache de 6 h pour les fiches et les avis, de 30 min pour la vitrine.
- **CSP** : `media-src` et `connect-src` ouverts à `video.akamai/fastly.steamstatic.com` pour les bandes-annonces.
- **Pas fait** : « N amis possèdent ce jeu » (un appel par ami, à voir à l'étape 8) et l'état réel de la liste de souhaits (étape 7).
- **Tests** : 34 tests Rust, dont la suppression dans une fausse bibliothèque et les garde-fous sur les noms de dossier. Vérifié dans l'aperçu : fiche, comparaison, désinstallation, magasin, installation en attente d'un jeu. **À vérifier dans l'exe** : vraie désinstallation, vraie installation pendant un jeu, masquage de la fenêtre Steam.

### Étape 6 — Profil, corbeille sur l'accueil (9 novembre 2026) — validée par Tom dans l'exe

- **Accueil** : une corbeille à côté de « Fiche du jeu » (demande de Tom) ouvre la même confirmation de désinstallation que la fiche. Elle est grisée si une désinstallation est déjà prévue.
- **Profil** (`src/pages/profil/`, maquette 04) :
  - avatar Steam, avec le croissant de niveau qui sert de jauge d'XP vers le niveau suivant, une pluie lunaire et des étoiles qui scintillent ;
  - pseudo, nom, pays (en français) et statut ;
  - 4 chiffres : jeux, heures des 2 dernières semaines, amis, badges ;
  - « Modifier dans Steam » (page `edit/info` du profil) ;
  - **rangs de temps de jeu** : les 10 paliers avec le nombre de jeux dans chacun. Le plus haut rang atteint est ouvert par défaut. Un clic sur un rang affiche ses jeux, qui mènent chacun à leur fiche ;
  - **activité récente** : jaquette, heures, date de la dernière partie, rang et croissant des succès ;
  - **badges** : niveau, nom (Années de service, Collectionneur de jeux, badges de jeux), date dans l'infobulle. L'API ne donne pas les images des badges.
- La teinte du fond vient des couleurs de l'avatar.
- Écart avec la maquette : « ces 2 semaines » au lieu de « ces 15 jours », parce que l'API de Steam compte sur 2 semaines.

### Étape 7 — Boutique complète, images en cache, liste de souhaits, classements (9 novembre 2026) — validée par Tom dans l'exe

- **Images plus rapides** (demande de Tom) : protocole `img` (`http://img.localhost/<adresse>`, `src-tauri/src/images_locales.rs`).
  - Chaque image de Steam est téléchargée une fois, rangée dans `images/` (dossier de données), puis lue sur le disque ;
  - seuls les CDN de Steam sont autorisés, pour que le protocole ne serve pas de relais vers un autre site ;
  - écriture atomique ; le cache est limité à 800 Mo (les plus anciennes images sont effacées au démarrage) ;
  - côté front, `viaCache()` (`src/lib/imageLocale.ts`) dans `imagesDe`, les avatars, les captures et la boutique. Dans l'aperçu navigateur, les adresses restent directes.
- **Boutique complète** (demande de Tom, `src/pages/magasin/`, `src-tauri/src/steam/boutique.rs`) :
  - recherche en haut de l'écran : résultats en direct (image, tags, prix), flèches et Entrée, « Voir les N résultats » en grille ;
  - le ruban de la vedette gagne l'onglet « À venir » ;
  - « Ta liste de souhaits » : 4 cartes, les promos d'abord, et un lien « Tout voir » ;
  - « Parcourir le magasin » : Meilleures ventes, Nouveautés, À venir, Offres, Gratuits et 12 genres. C'est une liste de lignes (bannière, tags, date, prix) avec un aperçu qui suit le survol (avis, tags, captures, Voir la fiche) ;
  - Rust : fiches courtes en lot (`GetItems` : images, prix, promo, avis, tags en français, captures), cache de 3 h par jeu. Recherche (`storesearch`), rayons (recherche JSON du magasin : gratuits, tags), noms des tags (`GetTagList`, 7 jours).
- **Liste de souhaits** (`src/pages/Souhaits.tsx`, maquette 05) :
  - bandeau « N de tes souhaits sont en promo » ;
  - tri Mon ordre / Promos d'abord / Prix ;
  - lignes avec image, date, avis, tags, date d'ajout, prix et Acheter (plein si promo, popup de sécurité) ;
  - croix au survol qui ouvre la page dans Steam (décision de l'étape 0) ;
  - lecture par `IWishlistService/GetWishlist`.
- **Classements** (`src/pages/Classements.tsx`, `src-tauri/src/steam/classements.rs`, maquette 06) :
  - onglets Meilleures ventes (de la semaine, en France) et Les plus joués (pic du jour) ;
  - le n°1 en grand avec son visuel ;
  - les places 2 à 10 avec leur évolution (▲ ▼ = nouveau) et « Voir le top 100 » ;
  - **« En jeu maintenant »** : Steam ne publie pas le total. C'est donc la somme des joueurs en jeu sur les 10 jeux les plus joués (`GetNumberOfCurrentPlayers`, relu toutes les 3 min). La courbe de 24 h est faite des relevés de ResTeaM (un toutes les 20 min, quand l'app est ouverte), et la page l'explique.
- **Tests** : 40 tests Rust (dont les hôtes autorisés du cache d'images, la lecture d'un produit en promo, les relevés sur 24 h) et 11 tests réseau ignorés, lancés une fois sur le vrai Steam.

### Étape 8 — Téléchargements, amis, recherche globale, hors ligne (9 novembre 2026)

- **Molette sur les rubans** (demande de Tom) : sur l'accueil et le magasin, la molette fait défiler le ruban de jaquettes à l'horizontale, en douceur. Aux deux bouts, elle rend la main à la page (`src/lib/molette.ts`).
- **Téléchargements** (`src/pages/Telechargements.tsx`) :
  - en cours, relu sur le disque toutes les 2 s : barre, octets, débit, temps restant, bouton « Suivre » qui ouvre le centre d'installation ;
  - en attente de Steam : installations et désinstallations en file, avec la raison et Annuler ;
  - mises à jour à faire ;
  - installés récemment ;
  - disques : jeux, poids et espace libre ;
  - état vide soigné.
- **Amis** (`src/pages/Amis.tsx`, lien « Tous les amis » dans le panneau de l'accueil) :
  - recherche par pseudo ou par jeu ;
  - groupes En jeu, En ligne, Hors ligne ;
  - le jeu en cours mène à sa fiche ; Rejoindre quand c'est possible ; profil Steam ; « + Ajouter un ami » ;
  - états vides, et cas de la liste privée.
- **« N amis possèdent ce jeu »** sur la fiche : commande `amis_possedant`. La bibliothèque de chaque ami est lue une fois (8 requêtes en parallèle au plus), puis gardée 24 h ; un profil privé compte comme « ne le possède pas ».
- **Recherche globale** (Ctrl+K, `src/pages/Recherche.tsx`) : ta bibliothèque, puis le magasin (sans les jeux que tu as déjà), puis tes amis, sans tenir compte des accents. Entrée ouvre le premier jeu.
- **Hors ligne** : sans Internet, une pastille l'indique en bas à gauche, et les pages affichent le cache. Au retour du réseau, toutes les données sont relues.
- Les dernières pages vides sont remplacées ; `EmptyPage.tsx` est supprimé.
- **Reste pour l'étape 9** : audit de sécurité, suppression de la page de test `/donnees`.

### Étape 8 bis — Profil des amis, favoris d'abord, app plus vivante (9 novembre 2026)

- **Profil d'un ami** (`/profil/:steamId`, commande `profil_joueur`) :
  - on l'ouvre en cliquant une carte de la page Amis, un nom dans le panneau de l'accueil ou un ami dans la Recherche ;
  - même page que le tien : niveau, rangs, activité, badges, avec « ← Amis » et « Voir sur Steam » ;
  - une partie privée (bibliothèque, badges) s'affiche vide proprement, sans faire échouer le reste ;
  - pas de croissant de succès dans son activité : l'API ne donne que les tiens ;
  - cache de 10 min.
- **Favoris d'abord** : l'accueil s'ouvre sur l'onglet Favoris (en premier dans le ruban), ou sur Reprendre s'il n'y a aucun favori.
- **Interactivité** (`src/lib/interactif.ts`, `src/styles/interactif.css`, un seul écouteur pour toute l'app) :
  - `data-incline` : inclinaison 3D vers la souris, avec un reflet, sur les jaquettes de la bibliothèque, l'avatar du profil, le n°1 des classements et les jaquettes de la recherche ;
  - `data-lueur` : halo qui suit la souris sur les cartes (ruban, boutique, souhaits, classements, amis, profil, téléchargements, sections de la fiche).
- **Vie** (`src/components/Vivant.tsx`) :
  - lucioles qui dérivent et s'allument doucement dans le fond de Profil (à la couleur de l'avatar), Amis, Souhaits, Classements et Téléchargements ;
  - compteurs qui défilent jusqu'à leur valeur (chiffres du profil, « En jeu maintenant ») ;
  - trois petites lunes en orbite autour de l'avatar ;
  - anneau du rang choisi qui respire, icônes des chiffres qui bougent au survol ;
  - anneau vert tournant autour des amis en jeu, pouls autour des amis en ligne.

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
