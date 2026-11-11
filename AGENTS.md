# ResTeaM — note de passation pour Codex

> Écrite le 11 novembre 2026 par Claude Code, à la demande de Tom, qui continue le projet avec Codex.
> Lis ce fichier en entier avant de toucher au code. Le détail de chaque étape est dans [PLAN.md](PLAN.md) (section 6, « Journal des étapes »).

## 1. Le projet en deux phrases

ResTeaM est une app Windows (Tauri 2 + React 19 + TypeScript, cœur en Rust) qui sert de **vitrine à Steam** : bibliothèque, magasin, amis, profil, téléchargements, Workshop, dans une interface sombre et animée. Elle s'appuie sur le compte et le client Steam, elle ne les remplace pas.

Tout le projet est dans ce dossier. Rien d'utile n'est ailleurs sur le PC.

## 2. Tom et sa façon de travailler

- Tom parle **français** : réponses, questions, messages de commit et journal en français, phrases simples.
- Il **teste uniquement dans l'exe de production**, depuis le raccourci `ResTeaM` du Bureau. Jamais en mode développement.
- Il surveille sa consommation : pas de gros chantier inutile, une étape à la fois.
- Il aime qu'on lui dise précisément ce qu'il doit fournir ou faire lui-même.
- Il veut une app **très animée, motion design pro façon Spotify** (voir section 6).

### Règles à suivre à chaque tâche

1. **Après tout changement de code** : `npm run build:exe`. Le script compile l'exe, l'aide Workshop, et met à jour le raccourci du Bureau. Attention, il ferme le ResTeaM ouvert.
2. **Ne jamais lancer l'exe pour le capturer, ni faire de capture d'écran du Bureau** : Tom peut être en pleine partie (c'est déjà arrivé). Pour vérifier un rendu, utiliser l'aperçu dans un navigateur :
   - `npm run build` puis `npm run preview`, et ouvrir `http://localhost:4173/?apercu=connecte` (faux back-end, données factices, dans `src/api/apercu.ts`) ;
   - les maquettes de référence : `npx vite kit/pages-autonomes --port 4174`.
   - Toute nouvelle commande Rust doit avoir sa réponse factice dans `src/api/apercu.ts`, sinon l'aperçu casse.
3. **Dépôt public** : `https://github.com/Y1UNO/ResTeaM`. Après chaque commit de fin d'étape, `git push`.
   - Les commits utilisent l'adresse anonyme déjà configurée dans le dépôt (`…@users.noreply.github.com`). Ne jamais publier l'adresse Gmail de Tom.
   - Ne jamais committer de données perso. `kit/references/steam-actuel/` (captures de son vrai compte) est dans `.gitignore` et doit y rester.
   - Les captures publiques (`docs/captures/`) se font en mode aperçu, avec des données factices.
4. **Tenir le journal** : chaque étape finie ajoute une entrée dans `PLAN.md` (section 6), avec ce qui a été fait et une ligne « À vérifier dans l'exe ». Mettre le `README.md` à jour quand une grande page apparaît.
5. **Messages de commit** : une phrase en français qui décrit ce que Tom verra (voir `git log`).
6. La clé Steam Web API n'est **jamais** écrite dans le code, le dépôt ou une conversation. Tom la saisit dans l'app.

## 3. Direction artistique « Nocturne · Clair de lune »

Référence complète : [kit/DA.md](kit/DA.md). Maquette qui fait foi : `kit/design/01-accueil-reference-V3.dc.html`. Jetons CSS : `src/styles/tokens.css` (toujours passer par eux, pas de valeurs en dur).

| Élément | Règle |
|---|---|
| Fond | `#09090A`, presque noir |
| Accent | **un seul** : `#EEF2FF` (blanc lunaire), réservé aux interactions (bouton principal, survol, sélection, jauges). Texte posé dessus : `#0A0D14` |
| Couleur | Elle vient **des images des jeux**, jamais de l'interface. Pas de couleurs vives, pas de dégradés colorés, pas de violet « IA » |
| Surfaces | Verre fumé : `rgba(18,18,20,.55–.65)` + `backdrop-filter: blur(14–26px)`, bordure `rgba(238,242,255,.08–.18)` |
| Texte | `#F2F2F3`, puis `#C9C9CE`, `#A3A3A8`, `#8E8E94` |
| Polices | Space Grotesk 700 pour les titres et les chiffres (espacement négatif), Inter pour le texte. Embarquées (`@fontsource`), jamais chargées en ligne |
| Tailles | Titre de page 64 px, titre du jeu en vedette 88 px, petits labels 11–13 px en majuscules espacées |
| Rayons | 12–18 px (boutons, petites cartes), 20–28 px (grandes cartes), 999 px (pastilles) |
| Ombres | Profondes et noires (`--shadow-1` à `--shadow-3`) |
| Icônes | Maison (`src/components/icons.tsx`) : trait fin blanc lunaire, sans couleur, animées au repos et au survol. Pas de bibliothèque d'icônes |
| Animations | **Uniquement `transform` et `opacity`**. Courbe `cubic-bezier(.2,.7,.2,1)`, 0,35 à 0,9 s. Jamais de fermeture instantanée : tout ce qui s'ouvre se referme en animation |
| Moins d'animations | Tout s'arrête si Windows le demande (`prefers-reduced-motion`), **sauf le logo**, qui tourne toujours (décision de Tom) |

Éléments signature à réutiliser plutôt que réinventer : affiche du jeu en fond avec brume et lueurs aux couleurs de l'affiche (`HeroBackdrop`, `Ambiance`), jaquette inclinée en 3D, croissants de lune pour les jauges (`Croissant`), lune du niveau (`LuneCeleste`, 30 niveaux), badges de rang (`BadgeRang`), fumée monochrome (`Smoke`), chiffres qui défilent (`Vivant`, `Prix`), carnet magique (`CarnetMagique`).

Principes : le jeu est la star, une action principale par écran, lisible avant tout, rien ne suit le curseur.

Fenêtre sans cadre Windows, 2560 × 1440 chez Tom, taille minimale 1280 × 800, maquettes calées sur 1440 px de large.

## 4. Architecture à respecter

```
src/            interface React
  api/          commandes.ts (appels invoke typés), requetes.ts (TanStack Query),
                types.ts, apercu.ts (faux back-end de l'aperçu)
  app/          Layout, barre de gauche, barre de titre, routes (paths.ts, router.tsx)
  pages/        une page par dossier
  components/   éléments signature
  styles/       tokens.css, animations.css, composants.css
src-tauri/src/  cœur Rust
  commandes.rs  toutes les commandes exposées au front (à déclarer aussi dans lib.rs)
  cache.rs      cache SQLite chiffré (coffre.rs, DPAPI de Windows)
  steam/        Web API, magasin, fichiers locaux de Steam (vdf.rs), liens steam://,
                installation, redémarrage de Steam, Workshop
  salon.rs      salon d'achat (vraies pages de Steam dans une fenêtre isolée)
  jeu.rs        suivi du jeu lancé, journal.rs, notes_jeu.rs, notifications.rs
src-tauri/workshop-aide/   petit exe à part (API Steamworks) pour s'abonner aux mods
serveur/        Worker Cloudflare du partage des profils (déjà déployé)
kit/            kit de design (maquettes, DA, captures)
```

Règles de sécurité, déjà auditées deux fois (`AUDIT-SECURITE.md`, `AUDIT-SECURITE-2.md`). **Ne pas les affaiblir** :

- **Tout le réseau passe par Rust.** Le WebView n'appelle jamais Steam. La CSP (`src-tauri/tauri.conf.json`) est stricte.
- **Le front choisit une action, jamais une adresse.** Les liens `steam://` et les pages web sont construits et vérifiés en Rust (`steam/liens.rs`, listes de domaines autorisés).
- **La clé API** vit dans le Gestionnaire d'identifiants Windows et ne repart jamais vers le front.
- **Fichiers de Steam** : lecture libre ; écriture **seulement Steam fermé**, avec copie de secours et écriture atomique, par la file `steam/redemarrage.rs` (qui attend la fin du jeu en cours).
- **Salon d'achat** : aucune commande ResTeaM accessible depuis la page de Steam, dossier WebView2 à part, **aucun script ni CSS injecté** dans les pages de Steam.
- **Capacités Tauri** (`src-tauri/capabilities/`) : le minimum par fenêtre.
- Les textes venus de l'extérieur (pseudos, noms de jeux, patch notes) sont affichés comme du texte, jamais comme du HTML.
- Chaque analyseur a ses tests (`cargo test`, dont `robustesse.rs` en proptest). Toute nouvelle lecture de fichier ou de réponse Steam doit en avoir.

## 5. Ce qui est fait

Tout est dans le journal de `PLAN.md`, étapes 1 à 28. En résumé :

- Connexion Steam (OpenID), clé API, cache hors ligne chiffré.
- Accueil (jeu en vedette, patch notes triées, ruban des favoris, amis), Bibliothèque, Magasin et boutique, fiche d'un jeu, Classements, Liste de souhaits, Téléchargements, Amis, Recherche globale.
- Installation et désinstallation sans la fenêtre de Steam, propriétés d'un jeu, paramètres de Steam.
- Profil personnalisable, rangs de temps de jeu, total des trophées, lune à 30 niveaux, profil des amis.
- Communauté : fil des amis, Workshop (voir, installer, retirer des mods), captures, créations.
- Salon d'achat, ResTeaM au démarrage de Windows, zone de notification, Steam caché derrière, suivi du jeu lancé.
- Notifications maison, manette et mode Salon, coffre-fort, deux audits de sécurité.
- Serveur de partage des profils (Cloudflare, déployé).
- Journal des sessions et calendrier, vraie phase de la lune, roulette « Ce soir je joue à… », pile de la honte, prix par heure, historique des patch notes, carnet de notes par jeu, jeux en commun, duel de profils.

État le 11 novembre 2026 : dépôt propre, `npx tsc --noEmit` sans erreur, `cargo test` vert (111 réussis, 17 ignorés), tests du serveur verts (5 sur 5). L'exe du Bureau date du dernier commit de code (10 novembre, 02 h 36).

**Beaucoup d'étapes n'ont pas encore été validées par Tom dans l'exe** (il prévoyait « un gros test »). Sont validées : 2a, 2b, 4 bis, 5, 6, 7, 8, 8 bis, 10 et 20. Pour les autres, chercher « À vérifier dans l'exe » dans `PLAN.md` : c'est la liste de contrôle. S'attendre à des retours de Tom sur ces étapes.

## 6. Ce qui reste à faire, dans l'ordre

### A. Les deux nouvelles demandes de Tom (11 novembre 2026)

**A1. Jeux non Steam** (« comme sur Steam, pouvoir ajouter des jeux non Steam »)

- But : ajouter un jeu ou une app qui ne vient pas de Steam (un exe), le voir dans la Bibliothèque et sur l'accueil avec les autres, et le lancer depuis ResTeaM.
- Ce qui existe chez Steam (**à vérifier d'abord sur le PC de Tom, en lecture seule**) :
  - les raccourcis non Steam sont dans `<Steam>\userdata\<id>\config\shortcuts.vdf`, un **VDF binaire** (ce n'est pas le format texte que lit `steam/vdf.rs`, il faut un second analyseur, avec ses tests proptest) ;
  - leurs images perso sont dans `userdata\<id>\config\grid\` ;
  - Steam réécrit ce fichier en se fermant : toute écriture doit passer par la file `redemarrage.rs`, Steam fermé, avec copie de secours.
- Chemin conseillé, en deux temps :
  1. **Lire** `shortcuts.vdf` pour afficher les jeux non Steam que Tom a déjà dans Steam, et **garder une liste propre à ResTeaM** (nom, exe, dossier de départ, options, image choisie) dans un fichier chiffré par le coffre-fort. Lancement direct par Rust.
  2. Ensuite seulement, option « l'ajouter aussi dans Steam » (écriture de `shortcuts.vdf`), pour avoir l'overlay et le temps de jeu de Steam.
- Points d'attention :
  - choisir l'exe avec une vraie fenêtre de fichiers de Windows, côté Rust. Le front ne donne jamais un chemin libre à exécuter : il donne l'identifiant d'une entrée déjà enregistrée ;
  - refuser tout ce qui n'est pas un fichier existant en `.exe`, `.lnk` ou `.url` ; jamais de ligne de commande passée par un shell ;
  - ces jeux n'ont pas d'appid Steam : prévoir un identifiant à part dans les types (`src/api/types.ts`), et vérifier chaque page qui suppose un appid (fiche, trophées, patch notes, prix par heure, rangs) ;
  - le suivi de session (`jeu.rs`) lit `RunningAppID` dans le registre, qui ne vaut que pour les jeux Steam : pour un jeu lancé par ResTeaM, suivre le processus lancé ;
  - image : laisser Tom choisir une jaquette (comme la photo de profil, voir `enregistrer_media_perso`), avec un dégradé de la DA par défaut ;
  - demander à Tom où placer le bouton « Ajouter un jeu non Steam » (Bibliothèque, menu du logo…).

**A2. Activer une clé de jeu** (« activer directement des codes, si on achète sur Instant Gaming »)

- But : coller une clé Steam dans ResTeaM et l'activer sans chercher le menu de Steam.
- Steam n'a **aucune API** pour activer une clé à la place de l'utilisateur. Deux chemins officiels :
  1. **Salon d'achat** (conseillé, tout reste dans ResTeaM) : ouvrir la page officielle `https://store.steampowered.com/account/registerkey?key=<clé>` dans le salon, où Tom est déjà connecté. Tom coche l'accord et valide lui-même sur la page de Steam. **Ne rien cocher ni cliquer à sa place** (aucun script injecté, règle du salon).
  2. **Secours** : `steam://open/activateproduct` ouvre la fenêtre d'activation du client Steam (la clé n'est pas préremplie).
- Points d'attention :
  - valider la forme de la clé en Rust avant de construire l'adresse (blocs de lettres et chiffres séparés par des tirets, par exemple `XXXXX-XXXXX-XXXXX`), retirer les espaces, mettre en majuscules. Ajouter une action dédiée (`ActiverCle`) plutôt que de laisser le front fournir une adresse ;
  - **la clé ne doit être ni gardée, ni journalisée, ni mise en cache**. Attention : `salon.rs` publie l'adresse de la page vers la barre du salon (`EtatSalon.url`) ; masquer le paramètre `key` avant de l'afficher ;
  - confirmer que le lien `registerkey?key=` préremplit toujours le champ (c'est le lien qu'utilisent les revendeurs) ;
  - Instant Gaming vend aussi des clés pour d'autres plateformes (EA, Ubisoft, Epic…) : l'écran doit dire clairement « clé Steam uniquement » ;
  - après l'activation : vider le cache de la bibliothèque (clé du cache dans `commandes::bibliotheque`) et proposer « Installer » ;
  - demander à Tom où placer l'entrée « Activer une clé » (Magasin, Bibliothèque, menu du logo).

### B. Motion design pro (priorité de Tom, PLAN.md section 4 ter, point 14)

Tom veut une app beaucoup plus animée, dans le genre de Spotify. Lui **proposer** avant de coder : entrées de page orchestrées, transitions entre les pages, éléments partagés qui glissent d'une page à l'autre (jaquette → fiche), listes en cascade, survols plus riches, chiffres qui défilent, fonds qui respirent avec la couleur de l'affiche. Toujours dans la DA, en `transform` et `opacity`.

### C. Idées retenues, pas encore faites (PLAN.md section 4 ter)

| # | Idée | Remarque |
|---|---|---|
| 4 | **ResTeaM Wrap** (récap du mois et de l'année façon Spotify Wrapped, image à partager) | « Indispensable » pour Tom. Se nourrit du journal des sessions |
| 8 | **Défis entre amis** (« premier à finir tel jeu à 100 % ») | Demande le serveur de partage |
| 9 | **Alertes de prix** par jeu de la liste de souhaits, **historique des prix** relevé au fil des jours | |
| 10 | **Fond Wallpaper Engine actif** repris sur l'accueil, avec flou et filtres d'ambiance | |
| 11 | **Fond du profil** : image ou vidéo, flou, assombrissement, teinte, position | |
| 12, 13 | **Coffre à styles** : un ticket gratuit par jour, collection, raretés, échanges, bundles, bouton « Soutenir » | **Tout à la fin** (décision de Tom). Pas de tickets payants : lire les points juridiques de la section 13 avant d'y toucher |

### D. Refusé par Tom, ne pas reproposer

Lanceur rapide global, sons d'interface, mini-widget pendant le jeu, overlay injecté dans les jeux, liste de souhaits modifiable par cookies.

## 7. Points fragiles repérés pendant le tour du 11 novembre 2026

Par ordre d'importance. Rien n'a été modifié dans le code : à traiter avec Tom.

1. **Les notes et le journal peuvent être perdus.** `Cache::vider()` (`src-tauri/src/cache.rs`) efface **toute** la table. Il est appelé à la connexion, à la déconnexion, et quand la clé API est enregistrée ou supprimée (`commandes.rs`). Or le carnet de notes par jeu (`notes:<appid>`) et le journal des sessions (`journal:<année-mois>`) sont rangés dans cette même table. Changer sa clé API efface donc les notes de Tom et tout ce qui nourrira le Wrap. Correction conseillée : sortir ces données du cache (table ou fichier à part), ou au minimum ne pas effacer les clés `notes:` et `journal:`, puis ajouter un test. À faire **avant** le Wrap.
2. **Aucune sauvegarde de ces données.** Elles sont chiffrées par DPAPI, donc liées à la session Windows de Tom : une réinstallation de Windows les rend illisibles. Prévoir un export (au moins des notes).
3. **Le cache ne se purge jamais.** Les lignes périmées restent (c'est voulu pour le mode hors ligne), mais rien ne les élague : `cache.sqlite` grossit sans fin (une ligne par page d'historique de patch notes, par fiche, par profil d'ami…). Prévoir un élagage au démarrage des lignes périmées depuis longtemps, sans toucher aux notes et au journal.
4. **Suivi du jeu lancé** (`jeu.rs`) : il repose sur `RunningAppID` du registre. Si ResTeaM est fermé pendant qu'un jeu se termine puis que le même jeu est relancé avant de rouvrir ResTeaM, les deux parties sont comptées comme une seule. Mineur.
5. **Documentation en retard** :
   - `PLAN.md` section 2 décrit l'arborescence prévue au départ (`commands.rs`, `store.rs`…), pas les vrais fichiers. L'arborescence de la section 4 de cette note est la bonne ;
   - `PLAN.md` section 1 dit « aucun paiement, pas de communauté » : c'était le périmètre de départ, dépassé depuis (salon d'achat, Communauté) ;
   - `PLAN.md` section 5, « Encore ouvert » : les deux points sont réglés (clé saisie, dépôt public).
6. **Serveur de partage** : le déploiement (`npx wrangler deploy` dans `serveur/`) demande le compte Cloudflare de Tom (`npx wrangler login`, à faire par lui). L'adresse du serveur est écrite en dur dans `partage.rs`, `images_locales.rs` et la CSP : les trois doivent changer ensemble.
7. **Aide Workshop** : `resteam-workshop.exe` et `steam_api64.dll` doivent rester à côté de `ResTeaM.exe`. `npm run build:exe` s'en charge ; `tauri build` seul (installeur) ne les embarque pas.

## 8. Commandes utiles

```bash
npm install            # dépendances
npm run build:exe      # exe de production + raccourci du Bureau (à faire après chaque changement)
npm run typecheck      # types TypeScript
npm run build          # puis npm run preview : aperçu sur http://localhost:4173/?apercu=connecte
```

```bash
cd src-tauri && cargo test      # tests Rust (analyseurs, liens, robustesse)
cd serveur && npm test          # règles du serveur de partage
```
