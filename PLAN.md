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

## 4 bis. Suite du plan (demande de Tom, 9 novembre 2026)

Tom a validé les étapes 1 à 8 dans l'exe. Pour que ResTeaM remplace vraiment Steam au quotidien, il a choisi : les réglages (ceux de chaque jeu et ceux de Steam), le Workshop (mods installés et vitrine), remplacer Steam, les notifications, le lancement des jeux, la manette et le plein écran.

| # | Contenu | Vérification dans l'exe |
|---|---|---|
| 10 | **Propriétés d'un jeu** (sur la fiche) : options de lancement, mises à jour automatiques, Steam Cloud, overlay, ouvrir le dossier, DLC installés, vérifier les fichiers. Les fichiers de Steam (`localconfig.vdf`, manifeste) ne sont modifiés que Steam fermé, par la file de redémarrage | Une option de lancement est bien prise par Steam |
| 11 | **Paramètres de Steam** dans les Paramètres de ResTeaM : limite de débit, téléchargements pendant le jeu, disques et bibliothèques, démarrage de Steam avec Windows, overlay. Lecture d'abord, écriture Steam fermé | Une limite de débit changée dans ResTeaM est appliquée par Steam |
| 12 | **Workshop** : mods installés par jeu (`appworkshop_<id>.acf` + détails), vitrine et recherche des mods d'un jeu (`IPublishedFileService/QueryFiles`). S'abonner ouvre la page dans Steam (pas d'API sans session web) | Les mods de Tom apparaissent, la recherche marche |
| 13 | **Remplacer Steam + lancement des jeux** : démarrage avec Windows, icône dans la zone de notification, fermer = réduire, Steam lancé et gardé caché derrière. Au lancement d'un jeu : retour « en cours… », minuteur de session, ResTeaM se réduit, puis revient à la fin | ResTeaM au démarrage de Windows, Steam jamais visible |
| 14 | **Notifications Windows** : téléchargement terminé, mise à jour prête, un ami lance un jeu, une promo dans la liste de souhaits. Réglables dans les Paramètres | Notification reçue à la fin d'un téléchargement |
| 15 | **Manette et plein écran** : navigation à la manette dans toute l'app (API Gamepad de WebView2), focus visible, mode plein écran « Salon » | Toute l'app se pilote à la manette |

À vérifier avant d'écrire dans les fichiers de Steam : les clés exactes, en lisant d'abord les fichiers du PC de Tom, sans rien modifier.

**Faits le 9 novembre 2026** (Tom : « fais tout, je ferai un gros test ensuite ») : 11 → journal « Étape 13 », 13 → « Étape 14 », 14 → « Étape 15 », 15 → « Étape 16 ».

### Communauté (lot 2, avec le Workshop de l'étape 12) — faite, voir le journal « Étape 11 »

Noté le 9 novembre 2026, rien de commencé. Tom l'a demandé après le lot 3 bis.

**Place dans l'app** : un onglet **Communauté** dans la barre de gauche (icône `IconCommunity` déjà prête), entre Classements et Liste de souhaits. Raccourci depuis la fiche d'un jeu : bouton « Communauté du jeu ».

**Une page, plusieurs onglets** :

| Onglet | Contenu | Source |
|---|---|---|
| **Fil** (accueil) | Ce que font les amis : qui joue à quoi maintenant, jeux récents (heures sur 2 semaines), nouveaux jeux en commun. Cartes vivantes avec l'affiche du jeu | `GetPlayerSummaries` + `GetRecentlyPlayedGames` des amis (déjà en cache pour une partie) |
| **Workshop** | 1. **Mes mods** par jeu : nom, image, taille, date de mise à jour. 2. **Vitrine** d'un jeu : les plus populaires, récents, tendance, avec recherche et tags. 3. Fiche d'un mod : images, description, note, abonnés | Local : `steamapps/workshop/appworkshop_<id>.acf` et dossier `content/<id>/` ; détails et vitrine : `IPublishedFileService/GetDetails` et `QueryFiles` (clé côté Rust) |
| **Captures** | Mes captures d'écran par jeu, depuis le disque, en grille, avec agrandissement et « Ouvrir le dossier » | Local : `userdata/<accountid>/760/remote/<appid>/screenshots/` |
| **Créations** | Illustrations, guides et vidéos de la communauté d'un jeu, les plus populaires | `IPublishedFileService/QueryFiles` avec le type de fichier (types exacts à vérifier) |
| **Discussions** | Liens vers les forums du jeu (pas d'API publique) | Ouvre la page dans Steam |

**S'abonner ou se désabonner d'un mod** : aucune API publique sans session web Steam. Le bouton ouvre la page du mod dans Steam (`steam://url/CommunityFilePage/<id>`). Steam s'ouvre alors au premier plan, puis ResTeaM le recache. À tester : ouvrir plutôt dans le navigateur.

**Côté Rust** : nouveau module `steam/workshop.rs` (lecture des `.acf` avec `vdf.rs`, tailles des dossiers), commandes `mods_installes`, `vitrine_workshop`, `fiche_mod`, `captures_jeu`, `fil_amis`. Cache de 1 h pour la vitrine, de 10 min pour le fil. Les images de mods passent par le protocole `img` (ajouter l'hôte des images UGC, `images.steamusercontent.com`, à la liste autorisée et à la CSP). Les captures locales sont servies comme les fichiers `__perso__` (chemins vérifiés, jamais un chemin venu de la requête).

**À vérifier d'abord, sans rien modifier** : les `appworkshop_*.acf` et le dossier `760` sur le PC de Tom, et les réponses réelles de `QueryFiles`.

**Vérification dans l'exe** : les mods de Tom apparaissent, la recherche Workshop marche, ses captures s'affichent, le fil montre ses amis.

**Ensuite** : rangées de la boutique façon Steam (carrousels à flèches, « Car tu as joué à… », « Moins de 10 € », rangées par tag), puis les étapes 11, 13, 14 et 15.

### Acheter sans quitter ResTeaM (idée de Tom, 9 novembre 2026) — fait à l'étape 12, voir le journal

**Ce qui est possible, et ce qui ne l'est pas**
- Steam n'a **aucune API** pour qu'une autre app paie à sa place. Même l'API Steamworks ne permet aux jeux que leurs propres achats internes, ou d'ouvrir l'overlay, qui demande une fenêtre de jeu. Une page de paiement « 100 % ResTeaM » voudrait dire que ResTeaM touche aux cookies de connexion et aux moyens de paiement. **C'est non**, c'est précisément ce qu'il faut éviter.
- **Solution proposée : un « salon d'achat » dans ResTeaM.**
  - C'est une fenêtre ResTeaM à part, avec notre barre de titre, nos animations d'ouverture et de fermeture, et un fond assorti.
  - Elle affiche **les vraies pages officielles de Steam** : fiche, panier, connexion (QR code avec l'app Steam, ou mot de passe tapé directement chez Steam), paiement.
  - Steam gère tout : la connexion, la carte, PayPal, le Steam Guard.
  - Une barre de sécurité ResTeaM, au-dessus de la page, montre en permanence le vrai domaine (cadenas, `store.steampowered.com`) et le signale si la page sort de Steam.

**Sécurité du salon** (à valider dans l'audit)
1. La fenêtre n'a **aucun accès aux commandes de ResTeaM**. Les capacités Tauri ne concernent que la fenêtre principale.
2. Elle a son **propre dossier de données WebView2**. Les cookies de Steam y sont isolés, et chiffrés par Windows (DPAPI).
3. La navigation est limitée aux domaines de Steam (`store`, `checkout`, `login`, `help.steampowered.com`, `steamcommunity.com`). Tout autre lien, comme PayPal, s'ouvre dans le navigateur de Windows.
4. **Aucun script ni CSS injecté** dans les pages de connexion et de paiement. Ce sont les pages authentiques de Steam : une page de paiement qui ne ressemble plus à Steam habituerait à faire confiance à de fausses pages.

**Vérification dans l'exe** : acheter un jeu gratuit ou à 0,99 € de bout en bout, et vérifier qu'aucune donnée de Steam n'est accessible depuis la fenêtre principale.

### Coffre-fort et campagne « tout faire planter » (idée de Tom) — faits, voir le journal « Étape 18 » et `AUDIT-SECURITE-2.md`

1. **Coffre-fort** :
   - chiffrer avec la protection de données de Windows (DPAPI, liée à la session Windows de Tom) ce que ResTeaM garde sur le disque : `session.json`, choix de profil, file d'attente Steam, cache SQLite ;
   - la clé API reste dans le Gestionnaire d'identifiants ;
   - les cookies du salon d'achat restent dans leur dossier isolé.
2. **Tests pour tout faire planter**, avec un rapport `AUDIT-SECURITE-2.md` :
   - **fuzzing** des analyseurs (`vdf.rs`, `appworkshop`, `screenshots.vdf`, BBCode, en-tête Range, noms de fichiers, réponses Steam) avec `cargo-fuzz` / `proptest` ;
   - **fichiers piégés** : VDF corrompus, énormes ou en boucle, chemins Unicode, liens symboliques, dossiers Steam absents ;
   - **attaques du protocole `img`** : `..`, `%2e%2e`, chemins Windows, plages d'octets géantes ou négatives, fichiers de plusieurs Go ;
   - **commandes appelées avec n'importe quoi** : identifiants trop longs, négatifs, Unicode, injections dans les arguments de l'aide Workshop ;
   - **pannes** : Internet coupé, Steam fermé en pleine action, clé révoquée, quota Steam (429), disque plein ;
   - **charge** : des milliers d'images, une bibliothèque de 5 000 jeux, 1 000 mods ;
   - relecture de la CSP, des capacités Tauri et de l'isolement des fenêtres.
   - Chaque plantage trouvé donne une correction et un test qui l'empêche de revenir.

### Profil : total des trophées et lune à 30 niveaux — fait, voir le journal « Étape 17 »

Noté le 9 novembre 2026 (idée de Tom), rien de commencé. À placer juste avant ou juste après la Communauté, selon ce que Tom préfère.

**1. Total des trophées** (sur mon profil et sur celui des amis)
- Une case dans la rangée de chiffres du profil : **« Trophées 1 234 »**, avec le compteur qui défile à l'arrivée.
- Au survol : nombre de jeux à 100 %, trophée le plus rare (avec son pourcentage mondial) et dernier trophée obtenu.
- Source : les succès débloqués de chaque jeu joué. Un appel par jeu coûte cher, donc :
  - à vérifier d'abord : `IPlayerService/GetTopAchievementsForGames`, qui prend plusieurs jeux en un appel ;
  - sinon, `GetPlayerAchievements` jeu par jeu, en tâche de fond (4 à la fois), seulement pour les jeux avec du temps de jeu ;
  - cache de 24 h, et mise à jour seulement pour les jeux joués depuis.
- Amis : visible seulement si leurs détails de jeu sont publics. Sinon, « privé ».

**2. Lune du profil à 30 niveaux, propres à ResTeaM**
- Le niveau Steam reste affiché en petit. La lune suit un **niveau ResTeaM de 1 à 30** calculé avec des points (barème à valider avec Tom) :
  - trophées (1 point chacun) ;
  - heures de jeu (par exemple 1 point par heure) ;
  - jeux terminés à 100 % (gros bonus) ;
  - rangs des jeux (bonus à chaque rang atteint).
  - Courbe de plus en plus longue, pour que le niveau 30 reste rare.
- **Chaque niveau ajoute une petite amélioration visuelle**, et les paliers 5, 10, 15, 20, 25 et 30 changent franchement le style :

| Niveaux | Lune |
|---|---|
| 1 | Le visuel actuel |
| 2 à 4 | Cratères plus nets, première étoile qui scintille, halo léger |
| **5** | Halo qui respire, 3 étoiles autour |
| 6 à 9 | Poussière d'étoiles en orbite lente, reflets plus brillants |
| **10** | Anneau fin en orbite (style Saturne), teinte bleu lunaire |
| 11 à 14 | Deuxième anneau, petites lunes satellites |
| **15** | Constellation qui se dessine autour, trait par trait |
| 16 à 19 | Étoiles filantes de temps en temps, halo plus large |
| **20** | Lune argentée brillante, aurore en arrière-plan |
| 21 à 24 | Particules qui montent, reflets qui tournent |
| **25** | Éclipse dorée : couronne de lumière derrière la lune |
| 26 à 29 | Couronne plus vive, vagues de lumière |
| **30** | Lune céleste : tout réuni, couleur qui change lentement, effet unique |

- Toujours en transform et opacité, pour rester fluide.
- Écran « Niveau supérieur ! » animé quand on gagne un niveau.
- Un aperçu des 30 lunes au clic sur la lune, avec les points qui manquent pour la suivante.
- Les amis voient leur propre lune (calculée avec leurs données publiques).

**Vérification dans l'exe** : le total des trophées correspond à Steam (à comparer sur 2 ou 3 jeux), et la lune change bien d'aspect selon le niveau.

### Serveur de partage des profils (pour que les amis voient photo, bannière et style ResTeaM) — fait le 10 novembre 2026, voir le journal « Étape 19 »

Noté le 9 novembre 2026, à faire plus tard. **Oui, c'est faisable gratuitement**, et c'est largement assez puissant pour Tom et ses amis.

**Choix : Cloudflare** (offre gratuite)
- **Workers** : le petit serveur, 100 000 requêtes par jour.
- **R2** : stockage des fichiers, 10 Go gratuits, **téléchargements gratuits et illimités** (pas de frais de sortie), ce qui compte pour des bannières vidéo.
- **D1** : petite base pour les choix de style (fond, cadre, effet, couleur), 5 Go.
- Gros fichiers : un Worker gratuit accepte 100 Mo par envoi. Au-delà, ResTeaM envoie directement dans R2 avec une adresse signée (jusqu'à 5 Go), donc pas de vraie limite de poids.
- Ailleurs : Supabase limite à 50 Mo par fichier et met le projet en pause après une semaine sans activité. Firebase ne propose plus de stockage gratuit.

**Fonctionnement**
1. Une option « Partager mon profil ResTeaM » dans le pinceau magique. Elle est éteinte par défaut.
2. Pour prouver qui il est, Tom se connecte une fois avec Steam (OpenID), vérifié par le Worker lui-même. Le Worker donne un jeton, rangé dans le Gestionnaire d'identifiants Windows comme la clé API. **La clé API Steam n'est jamais envoyée au serveur.**
3. ResTeaM envoie la photo, la bannière et les choix de style, rangés sous le SteamID.
4. Sur le profil d'un ami, ResTeaM demande au serveur s'il a un profil partagé. Si oui, il l'affiche par-dessus les objets Steam. Les fichiers passent par le cache disque du protocole `img`, donc chaque ami ne télécharge qu'une fois par changement.
5. Sécurité : seuls les types image et vidéo sont acceptés, le serveur vérifie le jeton à chaque écriture, et chacun ne peut modifier que son propre profil.

**Ce que Tom devra fournir ou faire lui-même** (je ne peux pas créer de compte)
- Créer un compte Cloudflare gratuit.
- Activer R2. Cloudflare demande une carte bancaire même pour l'offre gratuite ; rien n'est débité sous les quotas. À confirmer au moment de l'inscription.
- Lancer `npx wrangler login` une fois et valider dans le navigateur.
- Choisir le nom du serveur (par exemple `resteam-profils`). L'adresse sera `https://<nom>.<compte>.workers.dev`.
- Ses amis doivent avoir ResTeaM, et aucun réglage n'est nécessaire de leur côté.

Je m'occupe du code du Worker (dans `serveur/`), du déploiement avec wrangler, de la CSP et du branchement dans ResTeaM.

## 4 ter. Idées retenues par Tom (9 novembre 2026, au soir)

Ordre prévu : Tom joue et teste l'exe. Ensuite, il crée le compte Cloudflare et on fait le **serveur de partage des profils** (section « Plus tard » ci-dessus). Après seulement, on attaque ces idées. Rien n'est commencé.

**Décision de Tom (9 novembre 2026)** : l'économie et les styles (coffre à styles, ticket du jour, bundles, soutien, échanges : sections 12 et 13) se font **tout à la fin**, après toutes les autres idées.

### Refusé par Tom (ne pas reproposer)
- **Lanceur rapide** (raccourci global) : Tom a déjà son app Kayro pour ça.
- **Sons d'interface** : inutiles pour ce genre d'app.
- **Mini-widget** pendant le jeu : pas besoin.
- **Overlay dans les jeux** (injection) et **liste de souhaits modifiable** (cookies) : déconseillés, Tom est d'accord.

### 1. La vraie lune de ce soir — fait le 10 novembre 2026, voir le journal « Étape 22 »
- Le logo et les lunes de ResTeaM suivent la phase réelle de la lune, calculée sur le PC (calcul astronomique, sans Internet). Pleine lune ce soir : logo plein.

### 2. Roulette « Ce soir je joue à… » — fait le 10 novembre 2026, voir le journal « Étape 22 »
- Une roue lunaire qui tire un jeu de la bibliothèque, avec des filtres : jamais lancé, pas fini, moins de 2 h, coop, favoris.
- Tom veut un **côté « gambling »** (suspense, ralentissement, révélation). Reste à trouver où la mettre : accueil, barre de gauche, ou bouton dans la Bibliothèque.

### 3. Journal des sessions — fait le 10 novembre 2026, voir le journal « Étape 21 »
- Historique de chaque jeu lancé (début, durée), à partir du suivi `jeu.rs` qui existe déjà. Gardé dans le cache chiffré.
- Calendrier « nuits de jeu » : une case par soir, plus lumineuse quand Tom a joué longtemps. Détail d'un soir au clic.

### 4. ResTeaM Wrap (indispensable pour Tom)
- Un récap animé façon Spotify Wrapped, du mois et de l'année, en écrans plein cadre qui défilent :
  - jeux les plus joués, heures, soirs de jeu, plus longue session ;
  - trophées gagnés, jeux finis à 100 %, niveaux de lune gagnés ;
  - pile de la honte vidée, meilleur prix par heure, amis avec qui il a le plus joué ;
  - une « personnalité de joueur » amusante.
- Bouton de partage (image à enregistrer).
- Il se nourrit du journal des sessions : plus on commence tôt à l'enregistrer, plus le Wrap sera riche. **Le journal (idée 3) passe donc avant.**

### 5. Pile de la honte — fait le 10 novembre 2026, voir le journal « Étape 23 »
- Les jeux achetés mais jamais lancés, triés par note Steam, avec un compteur qui descend quand Tom en lance un. Pont avec la roulette : « tirer dans la pile de la honte ».

### 6. Prix par heure — fait le 10 novembre 2026, voir le journal « Étape 23 »
- Ce que chaque heure de jeu a coûté (prix payé estimé à partir du prix actuel ou du prix de base de Steam, divisé par les heures). Classement des jeux les plus « rentables ». À afficher dans les stats du profil et dans le Wrap.

### 7. Notes par jeu
- Un petit bloc-notes perso sur la fiche de chaque jeu (où Tom en est, ses builds, ses codes, ses astuces), chiffré par le coffre-fort. Rien n'est envoyé nulle part.

### 8. Entre amis (tout est retenu)
- **Jeux en commun** : choisir 2 ou 3 amis et voir les jeux possédés par tous (profils publics). Idéal pour organiser une soirée.
- **Duel de profils** : Tom et un ami côte à côte (heures, trophées, lune, rangs, jeux en commun).
- **Défis** (« premier à finir tel jeu à 100 % ») : demande le serveur de partage.

### 9. Magasin (tout est retenu)
- **Alertes de prix sur mesure** : un seuil par jeu de la liste de souhaits (« préviens-moi sous 15 € »), avec notification Windows.
- **Historique des prix** : relevé par ResTeaM au fil des jours, pour savoir si une promo est vraiment bonne (courbe sur la fiche du jeu).

### 10. Ambiance : fond Wallpaper Engine actif
- ResTeaM lit le fond Wallpaper Engine qui tourne sur le Bureau et le reprend dans l'accueil, en vidéo 4K quand c'est possible (comme dans la fenêtre d'un mod).
- **Réglages** : intensité du flou et **plusieurs filtres d'ambiance** (par exemple Clair de lune, Nuit profonde, Brume, Néon, Sépia, Aurore), dans la DA, uniquement en transform et opacité pour les animations.

### 11. Personnalisation du profil (fond du thème)
- Des réglages de base pour le fond du profil : choix de l'image ou de la vidéo, flou, assombrissement, teinte, position.

### 11 bis. Notifications aux couleurs de ResTeaM (idée de Tom) — faites le 10 novembre 2026, voir le journal « Étape 20 »
- Tom trouve les notifications de Windows fades. On les remplace par **nos propres notifications** : une petite fenêtre ResTeaM sans cadre, transparente et toujours au-dessus, en bas à droite de l'écran, qui fonctionne même quand ResTeaM est rangé dans la zone de notification.
- Contenu selon le type :
  - **ami en jeu** : son avatar **animé** (avatar animé de Steam s'il en a un), son cadre, son pseudo, la jaquette du jeu ;
  - **téléchargement terminé, mise à jour** : la jaquette ou le visuel du jeu, une barre qui se remplit, un bouton « Jouer » ;
  - **promo** : la capsule du jeu, la réduction en grand, l'ancien et le nouveau prix ;
  - **niveau de lune, ticket du jour** (plus tard) : la lune qui grandit.
- Animation dans la DA (glisse depuis le bord, halo lunaire, fondu), en transform et opacité. Plusieurs notifications s'empilent. Disparition après quelques secondes, ou au survol on la garde. Un clic ouvre la bonne page de ResTeaM.
- Réglages : position (coin de l'écran), durée, et **« ne pas déranger en jeu »** (rien ne s'affiche pendant une partie : les notifications attendent la fin du jeu, ou passent en notification Windows discrète).
- Sécurité : la fenêtre ne charge que la page locale de ResTeaM, sans aucune capacité en dehors de « fermer » et « ouvrir ResTeaM » ; les textes (pseudos, noms de jeux) sont affichés comme du texte, jamais comme du HTML.
- La notification Windows actuelle reste en secours, si la fenêtre ne peut pas s'afficher.

### 12. Coffre à styles : un ticket gratuit par jour
- Côté « gambling » **gratuit** : **un ticket par jour**, qui ouvre un tirage animé (coffre lunaire, roue…) et fait gagner un style à collectionner.
- On travaillera **beaucoup de styles** :
  - contours de la photo de profil ;
  - fonds et bannières ;
  - effets de page (pluie, lucioles, étoiles, aurore…) ;
  - d'autres petits éléments à imaginer (badges, cadres de la lune, couleurs d'accent, titres…).
- Raretés (commun, rare, épique, légendaire, lunaire) et doublons. Une collection à compléter dans le pinceau magique.
- Aucun achat, aucun argent : seulement le ticket quotidien, avec peut-être un ticket bonus pour un niveau de lune gagné ou un jeu fini à 100 %.
- Avec le serveur de partage, les amis verront les styles gagnés, et le serveur pourra valider les tirages.

**Option payante (idée de Tom, à décider)** : permettre à ceux qui le veulent de payer, par exemple 0,99 € le ticket, avec des réductions selon les offres. Rien d'obligatoire, une petite rentrée d'argent.
- **Point juridique** : un tirage au sort **payant** est une « loot box ». Elles sont interdites en Belgique, surveillées en France (Autorité nationale des jeux) et dans l'UE, avec des règles fortes pour les mineurs. Les taux de chaque rareté doivent être affichés.
- **Recommandation de Claude** :
  - garder le hasard **gratuit** (le ticket du jour) ;
  - pour le payant, vendre des styles **au choix**, sans hasard : boutique de styles à 0,99 €, packs visibles à l'avance, réductions, « pass de saison » ou bouton « soutenir ResTeaM ».
  - Même rentrée d'argent, sans le risque des loot boxes.
- **Ce qu'il faudra** :
  - un statut pour encaisser (micro-entreprise par exemple, titulaire majeur) ;
  - un prestataire de paiement qui gère la TVA européenne : Lemon Squeezy ou Paddle (« vendeur officiel », TVA comprise), sinon Stripe ;
  - le paiement s'ouvre sur la page du prestataire : ResTeaM ne voit jamais la carte ;
  - le serveur de partage (Cloudflare) reçoit la confirmation du paiement et garde les styles achetés par SteamID. L'app ne fait que les lire : impossible de tricher en modifiant un fichier.
- **À vérifier avant de vendre quoi que ce soit** :
  - les conditions d'utilisation de l'API Web de Steam (usage commercial d'une app qui s'appuie dessus) ;
  - l'usage du nom « Steam » dans une app payante.


### 13. Économie des styles — décidé par Tom le 9 novembre 2026 au soir

**Décision finale** :
- **pas de tickets payants**, trop contraignants et trop risqués pour ce qu'ils rapportent ;
- on garde le **ticket gratuit du jour** (et les tickets bonus), les **bundles** payants et le bouton **Soutenir ResTeaM** ;
- presque tout s'échange (ticket du jour et bundles). Seul le soutien reste lié au compte.

Les lignes « tickets payants » ci-dessous sont abandonnées, gardées pour mémoire.

#### Réflexion d'origine

Idée de Tom :
- des tickets payants, réservés aux joueurs **éligibles** (critères stricts, pays où c'est interdit masqués) ;
- un bouton « Soutenir ResTeaM » ;
- des **bundles** achetables pour certains styles précis ;
- le reste s'obtient par le tirage ;
- une **économie d'échange** entre joueurs, avec une **échelle de valeur** pour voir d'un coup d'œil si un échange est intéressant.

**La règle à ne jamais casser** (avis de Claude) : un même objet ne doit jamais venir d'un **hasard payant** et être **échangeable**. Hasard payant + objets échangeables qui ont une valeur, c'est exactement ce que les régulateurs classent en jeu d'argent (affaire des « skins » de CS:GO, décisions aux Pays-Bas et au Royaume-Uni, surveillance de l'ANJ en France). Une échelle de valeur visible renforce encore cet argument, même sans retrait d'argent.

Structure proposée, qui garde toutes les idées de Tom :

| Source | Payant ? | Hasard ? | Échangeable ? |
|---|---|---|---|
| Ticket du jour (et tickets bonus gagnés en jouant) | non | oui | **oui**, entre amis |
| Bundles et styles au choix | oui | non | **oui** (on sait ce qu'on achète : ce n'est pas un tirage) |
| Soutenir ResTeaM (badge ou cadre « soutien ») | oui | non | non |
| Tickets payants (si on les garde) | oui | oui | **non**, jamais |

- **Échanges** (précision du 9 novembre au soir, Tom craignait qu'on ne puisse rien échanger) :
  - **presque tout s'échange** : tout ce qui vient du ticket du jour (la grande majorité des styles) et des bundles. Seuls le badge « Soutien » et les objets des éventuels tickets payants restent liés au compte ;
  - entre comptes ResTeaM, validés par le serveur (les deux acceptent, rien ne se perd) ;
  - l'échelle de valeur est en **points de rareté** (commun 1, rare 5, épique 20, légendaire 80, lunaire 300, à régler), **jamais en euros** ;
  - aucune revente contre de l'argent, aucun retrait.
- **Tickets payants**, seulement si Tom les veut vraiment après avoir lu ces contraintes :
  - réservés aux **18 ans et plus** : une case à cocher ne suffit pas, et une vraie vérification d'âge demande des données d'identité, à éviter ;
  - masqués dans les pays où c'est interdit (Belgique, et ceux qui suivront). Le pays est donné par le prestataire de paiement (pays de facturation) plutôt que par l'adresse IP, trop facile à contourner avec un VPN ;
  - chances de chaque rareté affichées avant l'achat, compteur de pitié (un épique garanti tous les N tirages), plafond de dépense mensuel ;
  - les lois changent : la liste des pays et les règles devront être tenues à jour, idéalement après l'avis d'un juriste.
  - **Recommandation de Claude** : commencer sans tickets payants (tirage gratuit, bundles, soutien), puis voir.
- Tout passe par le serveur de partage : solde des tickets, collection, échanges, achats confirmés par le prestataire. L'app ne fait que lire ces données, ce qui empêche la triche.

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

### Étape 8 — Téléchargements, amis, recherche globale, hors ligne (9 novembre 2026) — validée par Tom dans l'exe

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

### Étape 8 bis — Profil des amis, favoris d'abord, app plus vivante (9 novembre 2026) — validée par Tom dans l'exe

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

### Étape 9 — Audit de sécurité (9 novembre 2026)

- Rapport complet : `AUDIT-SECURITE.md`. Aucune faille grave.
- **Durcissements** :
  - OpenID : `openid.signed` doit couvrir les champs utilisés ;
  - nom du manifeste et des raccourcis tiré de Steam ;
  - les redistribuables de Steam ne peuvent pas être désinstallés ;
  - cache d'images plafonné à 25 Mo par image ;
  - CSP complétée (`object-src`, `base-uri`, `frame-src`, `form-action`, `worker-src`).
- **Retiré** : la page de test `/donnees` et son entrée de menu.
- **Dépendances** : `npm audit` et `cargo audit` sans vulnérabilité ; 5 avertissements RustSec sur des dépendances Linux ou de compilation, absentes de l'exe Windows.

### Étape 10 — Propriétés d'un jeu (9 novembre 2026) — validée par Tom dans l'exe

- **Clés vérifiées sur le PC de Tom** (lecture seule) :
  - `LaunchOptions` dans `userdata/<compte>/config/localconfig.vdf` (chemin `UserLocalConfigStore > Software > Valve > Steam > apps > <id>`) ;
  - `AutoUpdateBehavior`, `AllowOtherDownloadsWhileRunning`, `UserConfig.language` et `InstalledDepots.*.dlcappid` dans le manifeste.
  - Steam Cloud et overlay par jeu : aucune clé fiable trouvée, donc rien n'est écrit (à revoir à l'étape 11).
- **Modification en place** (`vdf::modifier`) : seule la valeur visée est remplacée, ou ajoutée dans son bloc (créé s'il manque). Le reste du fichier reste identique octet pour octet. Testé en mémoire sur les vrais `localconfig.vdf` du PC, sans écriture.
- **Écriture Steam fermé seulement** : les réglages passent par la file de redémarrage (`reglages` dans `FileSteam`). Après le jeu en cours, Steam est fermé, puis l'app fait une copie `*.resteam.bak` et une écriture atomique. Steam est ensuite relancé caché.
- **Fenêtre Propriétés** (`src/pages/fiche/Proprietes.tsx`), engrenage sur la fiche et sur l'accueil :
  - Général : options de lancement, avec des options courantes à ajouter d'un clic ;
  - Mises à jour : toujours / au lancement / en priorité, et téléchargements pendant le jeu ;
  - Fichiers : taille, dossier (« Ouvrir le dossier »), langue, version, dernière mise à jour, « Vérifier les fichiers » (fenêtre de Steam, `steam://validate`) ;
  - DLC installés, avec leurs images.
- Garde-fous : options sur une seule ligne, 1024 caractères au plus ; valeurs 0 à 2 ; compte à 17 chiffres.

### Étape 10 bis — DLC, lien des annonces, affiche de la fiche, badges et lune animés (9 novembre 2026)

- **DLC** :
  - l'API de Steam ne donne jamais les DLC possédés : vérifié avec la clé de Tom sur Isaac, `GetOwnedGames` renvoie le jeu mais pas ses DLC ;
  - l'onglet DLC liste donc **tous les DLC du jeu** : ceux de `appdetails`, ou à défaut une recherche dans la catégorie DLC filtrée sur le nom du jeu (pour Apex, dont la fiche ne liste rien) ;
  - les DLC qui ont des fichiers sont marqués « Installé », les autres ont leur prix et mènent à leur fiche ;
  - une note explique la limite (les DLC cosmétiques n'ont pas de fichiers).
- **Lien « Lire l'annonce complète »** : `GetNewsForApp` donne une adresse `steamstore-a.akamaihd.net`, refusée par la liste des pages autorisées. L'annonce pointe maintenant vers `store.steampowered.com/news/app/<id>/view/<gid>` (cache `actus2:`).
- **Fiche** : l'affiche du jeu est en fond, à peine floutée (7 px), en fondu vers le bas. Le bloc d'action est plus compact, pour que Jouer, Propriétés et Désinstaller tiennent sur une ligne.
- **Badge de rang** (`src/components/BadgeRang.tsx`) : un badge SVG maison qui évolue avec le rang :
  - 0 : anneau gris ; I : petit croissant ; II : graduations ; III : anneau tournant ; IV : bouclier ;
  - V : lianes et flammes ; VI : engrenage ; VII : croissant et étoiles ; VIII : rayons dorés ; IX : irisé ;
  - l'aura et les flammes grandissent avec le rang ;
  - il est sur l'accueil, la fiche, le profil, et sur les jaquettes de la bibliothèque (immobile là, pour la fluidité).
- **Jauge d'heures** : vague très légère et reflet sur les paliers remplis ; les paliers vides ne bougent pas.
- **Lune des succès** (`Croissant`) : elle se remplit à l'arrivée, sa lueur respire et un reflet parcourt l'arc. **À 100 %** : bleu lunaire brillant, cratères, halo qui tourne, éclats d'étoiles, légère flottaison.

### Étape 10 ter — Lot 1 des retours de Tom (9 novembre 2026)

- **Images manquantes** :
  - jaquette de secours = capsule verticale du magasin (`hero_capsule`) quand le jeu n'a pas de jaquette de bibliothèque ;
  - une erreur passagère de Steam ne fige plus de mauvaises adresses pour toute la session : le front réessaie, jusqu'à 5 fois.
- **Défilement plus fluide** (`src/lib/defilement.ts`) : pendant le défilement, les animations de décor sont en pause et les effets de survol coupés. Les longues sections hors de l'écran ne sont pas dessinées (`content-visibility`).
- **Écran de lancement** (`src/app/Lancement.tsx`) : logo animé, nom lettre par lettre, progression. Il précharge en arrière-plan les images des favoris, des jeux récents et des offres (cache disque). Il dure entre 1,4 et 7 s, une fois par lancement.
- **Boutique** :
  - prix qui défilent jusqu'à leur valeur ;
  - en promo, l'ancien prix se fissure et se brise, puis le prix promo défile ;
  - réductions en rouge vif, qui pulsent, avec un reflet ;
  - panier dont les articles sautillent (Acheter) ;
  - 16 genres de plus (dont Hack 'n' Slash, Souls-like, Metroidvania…) derrière « + genres » ;
  - sections variées : « Promos à ne pas rater » (une grande, deux moyennes), tuiles « Par genre » qui s'inclinent, rangée « Gratuits et populaires ».
  - Le prix affiché est toujours le bon, même si l'animation ne tourne pas (filet de sécurité).
- **Liste de souhaits** : l'affiche du jeu survolé passe en fond, en fondu ; un panneau de détails le suit à droite (captures, tags, avis, prix, Acheter). Les pages Amis, Téléchargements et Recherche prennent toute la largeur.
- **Rangs** : les badges flottent, un reflet les traverse, l'aura est plus visible. La rangée du profil a des badges plus grands, tous animés, qui grandissent au survol.

### Lot 1 bis — Classements, téléchargements, icônes (9 novembre 2026)

- **Classements** : l'affiche du n°1, très floutée et fondue sur les bords, colore le fond. « En jeu maintenant » devient vivant :
  - badge rouge « En direct » qui pulse, nombre qui défile, reflet qui passe ;
  - pic, moyenne et tendance depuis le relevé d'avant ;
  - courbe lisse (`src/components/Courbe.tsx`) : tracé animé, aire en dégradé, passage de lumière, point final qui pulse, transformation douce à chaque nouveau relevé ; sans données, une ligne de balayage.
- **Téléchargements** :
  - « Activité en direct » : deux courbes (connexion de tout le PC, écriture disque de Steam) sur 3 minutes, avec valeur actuelle, moyenne et pic, plus quatre chiffres (Go installés, espace libre, nombre de jeux, plus gros jeu) ;
  - **« Installer un jeu »** : on cherche un jeu non installé et on le **glisse dans la zone**. La jaquette suit la souris, la zone s'allume, puis la fenêtre d'installation s'ouvre. Un double-clic marche aussi. Le glisser se fait au pointeur, car la fenêtre Tauri réserve le glisser-déposer du navigateur aux fichiers.
- **Icônes dans la DA** (`src/components/icons.tsx`) : bibliothèque avec un croissant, sac du magasin, barres et étoile, croissant et étoile pour les souhaits, loupe-croissant, flèche dans un engrenage, icône Communauté prête. Petits mouvements au survol. Les boutons de la fenêtre sont redessinés : la croix tourne, le cadre grandit.
- Ta vidéo (Steam qui défile) a été lue en extrayant des images avec ffmpeg. **Pour le lot suivant** : plus de types de sections façon Steam (carrousels à flèches, « Car tu as joué à… », « Moins de 10 € », rangées par tag en bas de page).

### Lot 3 — Profil personnalisable, prix NaN, fluidité, clic droit (9 novembre 2026)

- **Prix « NaN,NaN € »** (Recherche, DLC) : serde renommait `final_` en `final`. Le nom est fixé (`#[serde(rename = "final_")]`), avec un test ; caches `produit2:` et `fiche3:`.
- **Défilement** :
  - retrait du mode « défilement » (une classe sur `<html>` qui recalculait toute la page) et de `content-visibility` sur les sections, qui faisait sauter la page ;
  - les animations qui redessinaient à chaque image sont remplacées : ombres et filtres qui pulsaient, reflets en dégradé, gradient SVG animé de la courbe ;
  - la rangée « Gratuits » ne détourne plus la molette : carrousel à flèches, comme Steam.
- **Classements** : retour aux barres, en plus vivant. Elles poussent à l'arrivée, une vague parcourt les barres remplies, les cases vides respirent, la dernière pulse, une lueur balaie la carte. Tout est en transform et opacité.
- **Panier** plus grand dans les boutons Acheter ; **Recherche** plus grande et plus aérée.
- **Clic droit sur un jeu de la bibliothèque** (`src/pages/bibliotheque/MenuJeu.tsx`) : Jouer, Installer ou Voir le téléchargement, Propriétés, Fiche, Ouvrir le dossier, Page dans Steam, Désinstaller.
- **Profil personnalisable** (`src/pages/profil/Personnalisation.tsx`) :
  - objets Steam équipés lus par `IPlayerService/GetProfileItemsEquipped` (public) : fond (vidéo webm/mp4), cadre d'avatar, avatar animé. Ils s'affichent aussi sur le profil des amis ;
  - **pinceau magique** sur son avatar : panneau pour choisir le fond (Steam, couleurs de l'avatar, nébuleuse, aurore, affiche d'un favori), le cadre (Steam, lunes en orbite, lianes, engrenages, aura, aucun), l'avatar animé, l'ambiance (pluie lunaire, lucioles, étoiles filantes, calme) et une couleur ;
  - les choix ResTeaM sont gardés sur ce PC ; les amis voient les objets Steam, car il faudrait un serveur pour partager les choix ResTeaM ;
  - CSP : `media-src` ouvert aux CDN d'objets Steam (`cdn.cloudflare/akamai/fastly.steamstatic.com`).

### Lot 3 bis — Retours sur le profil (9 novembre 2026)

- **Classements** : la lueur au centre de « En jeu maintenant » est retirée (et une accolade en trop dans `classements.css` qui cassait la compilation).
- **Clic droit partout** : le menu du navigateur est bloqué dans toute l'app (sauf dans les champs de texte). Le menu du jeu marche aussi sur le ruban de l'accueil.
- **Recherche** : au survol d'un jeu, son affiche s'installe en fond, floutée, en fondu.
- **Cadre lianes** redessiné : tige ondulée, feuilles orientées, trois fleurs, léger balancement.
- **Avatars animés partout** (`src/components/AvatarSteam.tsx`) : barre de gauche, amis (page et panneau), Recherche.
- **Pluie lunaire et étoiles filantes en plein écran**. La pluie reprend les gouttes de la lune. Cause du « ça ne marche pas » : l'animation d'entrée des pages gardait un `transform` (`both`), ce qui enfermait tout élément `fixed` dans la page. Elle est passée en `backwards` (corrige aussi l'affiche floutée de la Recherche).
- **Ma photo et ma bannière** (hors Steam) :
  - choisies dans le pinceau magique : image, GIF animé ou vidéo MP4 / WebM, sans limite de poids ;
  - envoyées en binaire brut (`enregistrer_media_perso`), rangées dans `perso/` du dossier de l'app, servies par le protocole `img` sous `/__perso__/` ;
  - seuls les noms `avatar.*` et `banniere.*` sont acceptés, testés par `fichiers_perso` ;
  - visibles dans ResTeaM sur ce PC. Pour que les amis les voient, il faudrait un serveur partagé (question posée à Tom).

### Étape 11 — Communauté (lot 2, avec le Workshop) (9 novembre 2026)

Nouvel onglet **Communauté** dans la barre de gauche (entre Classements et Liste de souhaits). Un bouton sur la fiche d'un jeu y mène directement (`/communaute?onglet=workshop&jeu=<id>`).

- **Fil des amis** :
  - « En jeu maintenant » : cartes avec l'affiche du jeu et un point « en direct » ;
  - « Les jeux du moment chez tes amis » : nombre d'amis et heures sur 2 semaines ;
  - « Ces deux dernières semaines » : qui a joué combien à quoi.
  - Source : `fil_amis`, la liste d'amis plus `GetRecentlyPlayedGames` par ami (8 à la fois, gardés 15 min, 60 amis au plus).
- **Workshop** :
  - choix du jeu : les jeux avec mods d'abord, puis les récents, ou n'importe quel jeu de la bibliothèque par recherche ;
  - **Mes mods** : lus dans `steamapps/workshop/appworkshop_<id>.acf` de chaque bibliothèque. Sur ce PC partagé, seuls les mods du compte connecté sont gardés (`subscribedby`). Tom : 196 fonds Wallpaper Engine (9,3 Go) et 53 mods d'un autre jeu. Détails publics par `GetPublishedFileDetails` (sans clé, gardés 1 jour), 40 par page, badge « Mise à jour » quand `latest_manifest` diffère ;
  - **Découvrir** : `IPublishedFileService/QueryFiles` (avec la clé, côté Rust), triés par mieux notés, tendance (7 jours), récents ou plus suivis, avec recherche. Gardé 1 h ;
  - fenêtre d'un objet : image, tags, description sans BBCode, avis, abonnés, taille. « S'abonner dans Steam » ouvre la page dans Steam, car il n'existe pas d'API publique pour s'abonner. « Ouvrir dans le navigateur » est aussi proposé ;
  - « Discussions du jeu » : ouvre les forums dans Steam.
- **Mes captures** : `userdata/<compte>/760/screenshots.vdf`, groupées par jeu, avec une visionneuse (flèches du clavier) et « Ouvrir le dossier ». Le protocole `img` les sert sous `/__captures__/<appid>/screenshots/…`. Le chemin est vérifié (chiffres, `screenshots`, nom `.jpg`, jamais de `..`), et toujours sous le dossier du compte connecté.
- **Créations** : illustrations, captures, vidéos et guides d'un jeu, par `QueryFiles` (`filetype` 2, 4, 3 et 10). Pour ces types, pas de filtre `creator_appid` : ils viennent du site ou du client Steam, pas du jeu.
- Vérifié sur les vraies données de Tom, en lecture seule, avec un test lancé à la main (`essai_reel`, ignoré par défaut) : Wallpaper Engine, Hades et CS2 répondent pour chaque type.
- Images : `steamuserimages-a.akamaihd.net` et les miniatures YouTube (`img.youtube.com`, `i.ytimg.com`) ajoutées aux hôtes autorisés du cache d'images.
- Tests : `mods_du_compte_seulement`, `numero_de_compte`, `chemins_de_captures`, `captures_triees`, `objet_de_query_files`.
- README : la Communauté ajoutée, avec deux captures (aperçu, données factices).

### Étape 11 bis — Installer les mods depuis ResTeaM, qualité des images (9 novembre 2026)

- **Cartes vides** : c'étaient les configurations de manette de Steam Input (app 241100, sans image, titres en codes internes comme `#Library_ControllerSaveDefaultTitle`). Elles sont masquées du Workshop (`HORS_WORKSHOP`). Une carte sans image montre maintenant une icône au lieu d'un dégradé vide.
- **Qualité de la fenêtre d'un objet** :
  - nouvelle fenêtre, bien plus grande : scène en haut (image entière sur un fond flouté de la même image), rangée de vignettes, puis le texte ;
  - galerie en grande taille (`previews` de `QueryFiles` / `IPublishedFileService/GetDetails`, souvent en 1080p) et vidéos YouTube (miniature, puis ouverture dans le navigateur) ;
  - **fond Wallpaper Engine installé de type vidéo** : la vraie vidéo du disque est lue en pleine qualité (jusqu'à la 4K). Elle est trouvée par le `project.json` (`type: video`, `file`), et servie par le protocole `img` sous `/__workshop__/<appid>/<objet>/<fichier>`, **par morceaux de 4 Mo** (en-tête Range, réponse 206), pour lire 200 Mo sans tout charger en mémoire. Le nom de fichier est vérifié (un seul élément, sans `..` ni lecteur), et le type est deviné par l'extension ou les premiers octets.
- **Installer et retirer un mod depuis ResTeaM** :
  - Steam n'a pas d'API web pour s'abonner. Seuls les jeux le peuvent, par l'API Steamworks (`ISteamUGC::SubscribeItem`). Une **aide séparée**, `resteam-workshop.exe` (crate `src-tauri/workshop-aide`, `steamworks` 0.13), se présente à Steam comme le jeu (`init_app`), s'abonne ou se désabonne, demande le téléchargement en priorité, puis s'arrête. Steam télécharge ensuite en arrière-plan.
  - L'aide et `steam_api64.dll` sont posées à côté de `ResTeaM.exe` par `build-exe.ps1`. ResTeaM ne charge jamais la DLL lui-même : il démarre même sans l'aide.
  - Essai sans risque sur le PC de Tom : abonnement à un fond déjà abonné → `OK`, aucun changement ; jeu non possédé → message clair.
  - Effet visible : pendant 1 à 2 secondes, Steam montre Tom « en jeu » sur le jeu du mod (Wallpaper Engine), comme quand un jeu s'ouvre.
  - Suivi : `etat_mod` lit toutes les 1,5 s les octets reçus dans `steamapps/workshop/downloads/<appid>/<objet>` (ou `content/`), jusqu'à ce que le mod apparaisse dans l'`appworkshop_*.acf` du compte. Barre de progression dans la fenêtre et sur la carte, puis « ✓ Installé ».
  - Retirer : demande de confirmation, puis désabonnement. « Installé » est aussi marqué dans la vitrine « Découvrir ».
  - Si Steam refuse (jeu non possédé, Steam fermé), le message propose « Ouvrir dans Steam ».
- Tests : `plages`, `noms_et_types_locaux`, `galerie_et_youtube` (59 tests en tout).

### Lot 4 — Retours sur le Workshop, icônes maison (9 novembre 2026)

- **Fenêtre d'un objet** : plus de fond flouté « mouillé ». L'image remplit toute la scène (agrandie si l'aperçu est petit, sans être coupée), sur un fond sombre avec un léger halo lunaire. Ordre des images : vidéo locale, puis galerie HD, puis aperçu de Steam (souvent un GIF animé), puis image du disque seulement s'il n'y a rien d'autre, sans doublons.
- **Panier communautaire** : nouvelle icône de la Communauté. Un panier tressé, deux joueurs qui en dépassent, et le croissant. Au survol, les têtes sortent.
- **Boutons de la fenêtre dans la DA** :
  - Réduire : un croissant qui se couche derrière l'horizon ;
  - Agrandir / Restaurer : quatre coins qui s'écartent ou se resserrent autour d'une étoile ;
  - Fermer : une croix qui tourne dans une orbite, avec une petite lune qui en fait le tour, et un rouge doux au lieu du rouge de Windows.
- Plans notés : salon d'achat officiel de Steam dans ResTeaM, coffre-fort et campagne de tests « tout faire planter ».

### Étape 12 — Salon d'achat, raccourci Workshop (9 novembre 2026)

- **Raccourci Workshop** dans la barre de gauche, avec un « panier communautaire » stylisé : panier tressé à anse, croissant accroché à l'anse et étincelle. Au survol, l'anse se soulève et l'étincelle scintille. `/workshop` ouvre directement l'onglet Workshop (titre « Workshop »), et le bouton de la fiche d'un jeu y mène. La Communauté retrouve son icône à deux joueurs.
- **Salon d'achat** (`src-tauri/src/salon.rs`, `src/salon/SalonBarre.tsx`) :
  - une fenêtre ResTeaM sans cadre Windows, qui contient deux webviews (Tauri `unstable`, `Window::add_child`) ;
    - en haut, `salon-barre` : une page locale de ResTeaM, que `main.tsx` reconnaît à son nom et qui n'affiche que la barre ;
    - en dessous, `salon-steam` : les **vraies pages de Steam** ;
  - la barre contient : précédente, suivante, recharger, accueil du magasin, **adresse réelle** (fournie par Rust depuis le moteur du navigateur, jamais par la page), Panier, ouvrir dans le navigateur, et les boutons de fenêtre dans la DA. L'adresse est en vert « Steam officiel » avec un cadenas sur `*.steampowered.com` / `*.steamcommunity.com`, en orange « Hors de Steam » ailleurs (PayPal…), en rouge si la page n'est pas chiffrée ;
  - **sécurité** :
    - aucune capacité ne vise la page de Steam, qui n'a donc aucun accès aux commandes de ResTeaM. La capacité `salon` ne vise que la barre (déplacer la fenêtre) ;
    - la page de Steam a **son propre dossier de données WebView2** (`salon-steam/`) : les cookies de Steam sont isolés de la fenêtre principale ;
    - SmartScreen est gardé (wry le coupe par défaut) ;
    - navigation en HTTPS seulement ;
    - les liens `steam://` partent vers le client Steam ;
    - « nouvel onglet » : une page de Steam reste dans le salon, une autre page part dans le navigateur ;
    - **aucun script ni CSS ajouté** aux pages de Steam. Seuls précédente et suivante passent par `history.back()` / `history.forward()`, de simples ordres de navigation qui ne lisent rien ;
  - fermer ResTeaM ferme le salon. Le salon s'ouvre sur la fiche du jeu sur Steam. Ajouter au panier, se connecter (QR code avec l'app Steam, ou mot de passe tapé chez Steam) et payer se font chez Steam ;
  - la popup d'achat propose « Ouvrir le salon d'achat », avec « Dans le client Steam » en second choix.
- Tests : `domaines`, `adresses_de_depart`, `navigation` du salon.
- **À vérifier dans l'exe** : ouverture du salon depuis Acheter, connexion Steam, panier, puis un achat de bout en bout (un jeu gratuit ou très bon marché), et redimensionnement de la fenêtre.

### Étape 12 bis — Salon gris, popup d'achat, icône Workshop (9 novembre 2026)

- **Le salon d'achat s'ouvrait en gris vide** (ni barre, ni page de Steam) :
  - cause : `ouvrir_salon` était une commande **synchrone**, donc exécutée sur le fil principal. Sous Windows, créer une webview depuis le fil principal bloque WebView2 (`Window::add_child` attend le fil principal ; Tauri le signale : « deadlocks when used in a synchronous command »). La fenêtre était créée, mais ses deux webviews jamais ;
  - correctif : `ouvrir_salon` et `salon_action` sont maintenant des commandes `async` (hors du fil principal) ;
  - la fenêtre reste **cachée** jusqu'à ce que la barre et Steam soient en place, sur le fond de la DA (`#09090A`, aussi pour les deux webviews avant leur premier affichage) : plus jamais de fenêtre grise. Si la création échoue, la fenêtre est détruite au lieu de rester vide ;
  - sécurité inchangée : aucune capacité pour la page de Steam, dossier de données WebView2 à part (`salon-steam/`), HTTPS seulement, aucun script ni CSS ajouté (la couleur de fond est un réglage de WebView2, pas une injection), adresse fournie par Rust.
- **Popup d'achat** : « Annuler » dépassait à gauche. Les deux choix (« Dans le client Steam », « Ouvrir le salon d'achat ») se partagent la largeur, et « Annuler » est un lien centré dessous.
- **Icône Workshop** : une personne qui tient un panier tressé, d'où dépasse un croissant de lune (une création qu'on partage), avec une étincelle. Au survol, le panier se soulève, le croissant sort et l'étincelle scintille. Différente du sac du Magasin et des deux joueurs de la Communauté.
- **À vérifier dans l'exe** : Acheter → « Ouvrir le salon d'achat » affiche la barre et la page du jeu sur Steam, puis redimensionner, réduire, agrandir et fermer le salon depuis sa barre.

### Étape 12 ter — Icônes vivantes, connexion gardée au salon (9 novembre 2026)

- **Barre de gauche** : icônes un peu plus grandes (22 → 26 px) et **toujours légèrement animées** : les croissants se balancent, les étoiles et étincelles scintillent, les barres des Classements respirent, la flèche des Téléchargements et le croissant du Workshop flottent. Chaque bouton a son propre décalage, pour qu'ils ne bougent pas ensemble. Le mouvement de veille passe par `rotate`, `translate`, `scale` et `opacity` : il s'ajoute au mouvement du survol sans le remplacer. Arrêté si Windows demande moins d'animations.
- **Connexion Steam dans le salon** :
  - le profil du salon (`salon-steam/`) est bien gardé sur le disque d'une ouverture à l'autre (le panier de Steam y reste, par exemple) ;
  - mais Steam ne garde la connexion que si **« Se souvenir de moi »** est coché au moment de se connecter. Sinon, la session meurt à la fermeture du salon. Aucun cookie de connexion n'était enregistré après le premier essai de Tom (seuls les noms et les dates des cookies ont été lus pour le savoir, jamais leurs valeurs) ;
  - la barre du salon affiche donc un rappel sur la page de connexion de Steam (`/login` ou `login.steampowered.com`, d'après l'adresse réelle fournie par Rust) : « Coche « Se souvenir de moi » pour rester connecté ». Rien n'est ajouté ni coché dans la page de Steam elle-même ;
  - aperçu : `?salon=barre&page=connexion`.
- **À vérifier dans l'exe** : se connecter au salon avec « Se souvenir de moi » coché, fermer ResTeaM, le rouvrir, puis rouvrir le salon : il doit être encore connecté.

### Étape 12 quater — Jaquettes du ruban plus grandes et plus nettes (9 novembre 2026)

- **Constat** : malgré son nom, l'image `library_600x900.jpg` de Steam ne fait que **300×450**. La vraie 600×900 est `library_600x900_2x.jpg` (vérifié sur six jeux). Les jaquettes du Magasin (`library_capsule`), les adresses de secours et l'aperçu prenaient la petite.
- **Images** :
  - `boutique.rs` prend `library_capsule_2x` (600×900), puis la simple, puis `library_600x900_2x.jpg` ;
  - les adresses de secours (`images.rs`, `lib/images.ts`) prennent la `_2x`. Si un vieux jeu n'a pas de `_2x`, le ruban et le hero se replient sur la petite avant d'afficher le dégradé (`replierJaquette`) ;
  - cache des images renouvelé (`images5:`) pour reprendre les nouvelles adresses tout de suite ;
  - `jaquette_petite` (300×450) reste pour les petites tuiles de la bibliothèque.
- **Ruban de l'accueil** : cartes au format 2:3 des jaquettes, donc l'image entière, sans rognage (le titre en haut de l'affiche n'est plus coupé) : 188×276 px, 204×300 px pour la carte choisie (avant : 176×230 et 196×252). Espacements resserrés pour que tout le ruban tienne dans un écran de 1080 px de haut.

### Fonds Wallpaper Engine en pleine qualité (9 novembre 2026)

- Tom trouvait les fonds pixelisés dans la fenêtre d'un objet. Pour un fond « scène », Steam ne fournit qu'un GIF de 250×250 (`preview.gif`, le même en ligne), qui était agrandi à 640 px.
- Une scène est faite de calques, assemblés en direct par Wallpaper Engine. Mais la plus grande texture de `scene.pkg` contient souvent un fichier lisible tel quel : une illustration PNG ou JPEG en 4K, ou une **vidéo MP4 en 3840×2160**.
- `workshop::lire_scene` lit la table du paquet (`PKGV…`), puis cherche dans les textures (`.tex`) un fichier rangé tel quel, précédé de sa taille. La recherche est bornée : table, noms et tailles sont vérifiés.
  - Une vidéo passe toujours en premier.
  - Une image n'est retenue que si elle a le format d'un écran (paysage, au moins 1600 px de large) : l'auteur d'un des fonds Wlop avait rangé dans le paquet son affiche de dons (portrait, codes QR), qui est écartée.
- Le fichier trouvé est servi par le protocole `img` sous le nom virtuel `__scene__`, par morceaux pour la vidéo. Le résultat est gardé en mémoire tant que `scene.pkg` ne change pas.
- Sur le PC de Tom : 335 scènes, dont 18 en vidéo HD et 200 en image HD (contrôle visuel sur un échantillon : ce sont bien les fonds). Pour les autres, l'aperçu reste à sa taille ×1,6 au centre, avec la mention « Aperçu de l'auteur · 250 px », au lieu d'être étiré.

### Étape 13 — Paramètres de Steam dans ResTeaM (9 novembre 2026)

- Nouvelle section « Steam » des Paramètres (`steam/parametres.rs`, `pages/parametres/ParametresSteam.tsx`).
- Clés vérifiées sur le PC de Tom (lecture seule) et dans le code de l'interface de Steam (`steamui/sp.js`) :
  - `config/config.vdf` (`InstallConfigStore > Software > Valve > Steam`) :
    - `DownloadThrottleKbps`, en **kilobits** par seconde (Steam affiche `valeur × 1000 / 8` octets ; 0 = sans limite) ;
    - `AllowDownloadsDuringGameplay` ;
    - `StreamingThrottleEnabled` ;
  - `userdata/<compte>/config/localconfig.vdf` (`UserLocalConfigStore > system`) : `EnableGameOverlay`.
- Limite de débit au choix (sans limite, 2, 5, 10, 25 ou 50 Mo/s, ou une autre valeur), téléchargements pendant le jeu, ralentissement pendant le streaming, overlay.
- Ces réglages s'écrivent **Steam fermé**, par la file de redémarrage, après une copie `.resteam.bak`. ResTeaM affiche « N changements à appliquer », puis l'état de la file (en attente du jeu en cours, Steam qui redémarre), et on peut annuler.
- « Lancer Steam avec Windows » (valeur `Steam` de la clé `Run`) s'applique tout de suite.
- Disques et bibliothèques : lecteur, nom, nombre de jeux, jauge d'espace utilisé, bouton « Ouvrir ». Seuls les dossiers déclarés dans `libraryfolders.vdf` peuvent être ouverts.

### Étape 14 — Remplacer Steam, suivi du jeu lancé (9 novembre 2026)

- Nouvelle section « ResTeaM au quotidien » des Paramètres :
  - **lancer ResTeaM avec Windows** : clé `Run`, argument `--demarrage`, ResTeaM part directement dans la zone de notification ;
  - **fermer = garder dans la zone de notification** ;
  - **lancer Steam caché** avec ResTeaM, s'il ne tourne pas déjà (`-silent`, puis sa fenêtre est renvoyée si elle s'ouvre) ;
  - **me laisser jouer** : ResTeaM se réduit quand un jeu se lance, et revient quand il se ferme.
  - Les préférences sont dans `preferences.json`.
- **Icône dans la zone de notification** : un clic ouvre ResTeaM. Le menu propose Ouvrir, Ma bibliothèque, Téléchargements et Quitter ResTeaM.
- **Une seule instance** : relancer l'exe (raccourci du Bureau) remet la fenêtre existante à l'écran.
- La fenêtre principale part cachée (`visible: false`) et se montre au démarrage, sauf si Windows l'a lancée.
- **Suivi du jeu** (`jeu.rs`) : `RunningAppID` est relu toutes les 2 s.
  - Une pastille « En cours · Nom du jeu · 12:34 » s'affiche en bas, et le bouton Jouer de l'accueil devient « En cours · 12:34 ».
  - À la fin du jeu : « Session terminée · 1 h 12 » pendant 8 s.
  - ResTeaM ne revient au premier plan que s'il s'était réduit lui-même.
- Aperçu : `?enjeu=1`.

### Étape 15 — Notifications Windows (9 novembre 2026)

- Quatre notifications (`notifications.rs`), chacune réglable dans les Paramètres :
  - **téléchargement terminé** et **mise à jour prête** : les `appmanifest` sont relus toutes les 8 s. Un jeu déjà vu installé avant son téléchargement compte comme une mise à jour ;
  - **un ami lance un jeu** : toutes les 90 s. Au-delà de 3 amis d'un coup, un seul résumé ;
  - **promo dans la liste de souhaits** : toutes les 6 h. Chaque promo (jeu, réduction, date de fin) n'est annoncée qu'une fois, mémoire de 60 jours.
- ResTeaM n'est pas installé par un installeur : il s'inscrit lui-même auprès de Windows, avec son nom et son icône (`HKCU\Software\Classes\AppUserModelId\com.yiuno.resteam`).
- Un clic sur une notification rouvre ResTeaM.
- Bouton « Envoyer une notification d'essai » dans les Paramètres.

### Étape 16 — Manette et mode Salon (9 novembre 2026)

- `lib/manette.ts`, avec l'API Gamepad de WebView2 :
  - la croix ou le stick gauche déplacent le focus vers l'élément le plus proche dans la direction (navigation spatiale), limité à la fenêtre ouverte s'il y en a une ;
  - A valide ; B ferme la fenêtre ouverte (Échap), sinon revient en arrière ;
  - LB et RB passent d'une page de la barre de gauche à l'autre ; Y ouvre la recherche ; le stick droit fait défiler ;
  - un bouton maintenu se répète (380 ms, puis toutes les 110 ms).
- Le focus est bien visible tant que la manette sert : anneau de clair de lune, curseur masqué. Il redevient discret dès que la souris bouge.
- Rappel des touches pendant 5 s quand une manette se branche.
- **Mode Salon** (Menu, F11, ou le menu du logo) : plein écran, interface agrandie à 125 % (zoom de WebView2), barre de titre masquée.

### Étape 17 — Profil : trophées et lune à 30 niveaux (9 novembre 2026)

- **Trophées** (`steam/trophees.rs`, commande `bilan_trophees`, cache de 6 h) :
  - `GetAchievementsProgress` est refusé avec une clé API (HTTP 405). `IPlayerService/GetTopAchievementsForGames` renvoie, par paquets de 25 jeux, **tous** les trophées obtenus (on en demande jusqu'à 10 000), le total du jeu et leur rareté ;
  - sur le compte de Tom : 712 trophées, 57 jeux qui en ont, 3 jeux à 100 %, en 1,1 s. Les totaux ont été recoupés jeu par jeu avec `GetPlayerAchievements`, sans écart sur 6 jeux ;
  - la case « Trophées » du profil affiche le total, qui défile à l'arrivée. Au survol : jeux à 100 %, trophée le plus rare (avec le % de joueurs) et dernier trophée obtenu (parmi les 5 jeux lancés le plus récemment) ;
  - pour un ami : ses données publiques, sinon « privé ».
- **Niveau ResTeaM de 1 à 30** (`lib/niveauResteam.ts`, barème à valider avec Tom) :
  - 1 point par trophée, 1 point par heure, 50 points par jeu à 100 %, 10 points par rang atteint sur chaque jeu ;
  - courbe en puissance 2,2 : niveau 10 ≈ 1 900 points, niveau 20 ≈ 9 900, niveau 30 = 25 000.
- **Lune céleste** (`components/LuneCeleste.tsx`), uniquement en transform et opacité :
  - 2 à 4 : cratères, étoiles, halo ;
  - 5 : halo qui respire, 3 étoiles ;
  - 6 à 9 : poussière d'étoiles en orbite ;
  - 10 : anneau, teinte bleue ; 11 à 14 : second anneau, satellites ;
  - 15 : constellation tracée ; 16 à 19 : étoiles filantes, halo large ;
  - 20 : lune argentée, aurore ; 21 à 24 : particules, reflet tournant ;
  - 25 : éclipse dorée ; 26 à 29 : couronne vive, vagues ;
  - 30 : couleurs qui se relaient, comète.
- Le niveau Steam reste affiché en petit sous la lune. Un clic sur la lune ouvre **l'aperçu des 30 lunes**, avec le détail des points et ce qui manque pour la suivante. Un niveau gagné déclenche l'écran **« Niveau supérieur ! »**.
- Aperçu : `?lune=N` montre la lune d'un niveau donné.

### Étape 18 — Coffre-fort et campagne « tout faire planter » (9 novembre 2026)

- **Coffre-fort** (`coffre.rs`) : `session.json` et chaque valeur du cache SQLite, dont la file d'attente de Steam, sont chiffrés par la protection de données de Windows (DPAPI, liée à la session de Tom, avec un sel propre à ResTeaM).
  - Au premier démarrage, les anciennes données en clair sont chiffrées, puis un `VACUUM` efface leurs traces.
  - La clé API reste dans le Gestionnaire d'identifiants Windows, et les cookies du salon dans leur dossier isolé.
- **Campagne** (`robustesse.rs`, `proptest`) : plus de 50 000 entrées tirées au hasard à chaque `cargo test --lib`, des fichiers piégés et des tests de charge. Détail dans `AUDIT-SECURITE-2.md`.
  - Faille corrigée : **débordement de pile** de l'analyseur VDF sur un fichier imbriqué très profondément. Il s'arrête maintenant à 64 niveaux, sans récursion.
  - Faille corrigée : **plantage** sur une description du Workshop avec un `[` jamais fermé avant un caractère Unicode.
  - Durcissement : les liens `steam://openurl` partent avec l'adresse normalisée, et les identifiants dans l'adresse sont refusés.
- 102 tests Rust (17 autres lisent le vrai PC et ne tournent qu'à la demande).

**À vérifier dans l'exe, pendant le gros test de Tom :**
1. Paramètres > Steam : mettre une limite de 10 Mo/s, puis Appliquer. Steam redémarre caché, et sa page Téléchargements affiche la limite.
2. Paramètres > ResTeaM au quotidien :
   - fermer avec × : ResTeaM reste près de l'horloge, et le clic sur l'icône le rouvre ;
   - « Quitter » le ferme vraiment ;
   - relancer l'exe remet la fenêtre existante ;
   - avec « Lancer ResTeaM avec Windows », redémarrer le PC : ResTeaM part caché, et Steam aussi.
3. Lancer un jeu : ResTeaM se réduit, « En cours » et le minuteur s'affichent. Fermer le jeu : ResTeaM revient avec la durée de la session.
4. « Envoyer une notification d'essai », puis la fin d'un téléchargement.
5. Brancher une manette : déplacements, A, B, LB et RB. Menu : mode Salon.
6. Profil : comparer le total des trophées avec Steam sur 2 ou 3 jeux, puis cliquer la lune.
7. Workshop : ouvrir un fond « scène » (par exemple le Wlop en vidéo).
8. Coffre-fort : `session.json` doit commencer par `rstm1:` après le premier lancement.

### Étape 18 bis — Menu du logo (9 novembre 2026)

- Au survol, les lignes du menu du logo (Paramètres, Mode Salon, Se déconnecter) prenaient le style de la petite étiquette « F11 » : bordure, marge réduite, décalage à droite. Le style de l'étiquette avait été inséré au milieu de la règle commune « survol + focus ». Les deux règles sont de nouveau séparées : lignes alignées, fond clair au survol.

### Étape 19 — Serveur de partage des profils (10 novembre 2026)

- **Compte Cloudflare** créé par Tom, R2 activé, sous-domaine neutre `resteam` (pas de pseudo ni d'adresse mail dans le code public). `wrangler` est connecté sur son PC.
- **Serveur** (`serveur/`, voir son `README.md`) : un Worker en ligne à `https://resteam-profils.resteam.workers.dev`, avec une base D1 `resteam-profils` (jetons, profils) et un stockage R2 `resteam-profils` (photos, bannières).
  - Connexion : ResTeaM ouvre `/auth/debut` dans le navigateur. Le **serveur vérifie lui-même** la réponse OpenID de Steam (champs, signature qui couvre tout, `check_authentication`), puis renvoie un jeton de 256 bits vers `127.0.0.1` (port et état validés). Seule l'empreinte SHA-256 du jeton est gardée, et 5 jetons au plus par compte.
  - Chacun n'écrit que dans son profil. Le style est **nettoyé** : seules les clés et valeurs connues sont gardées, 16 Ko au plus.
  - Les fichiers sont **vérifiés par leurs premiers octets** (PNG, JPEG, GIF, WebP, MP4, WebM : un HTML ou un SVG déguisé est refusé). La photo est limitée à 15 Mo et la bannière à 60 Mo. Ils sont servis avec `nosniff`, une CSP `sandbox`, des plages d'octets (vidéo) et un cache immuable (adresse versionnée `?v=`).
  - « Arrêter le partage » efface tout : profil, fichiers et jetons.
  - Aucune erreur interne n'est détaillée dans les réponses. La clé API Steam n'est jamais envoyée.
  - Tests : `npm test` (règles), essais complets en local (`wrangler dev`), puis sur le vrai serveur avec un compte fictif, effacé ensuite.
- **ResTeaM** (`partage.rs`, `pages/profil/PartageProfil.tsx`) :
  - dans le pinceau magique, **« Partager avec mes amis »**, coupé par défaut. « Partager mon profil » ouvre la connexion Steam dans le navigateur ;
  - le jeton est rangé dans le Gestionnaire d'identifiants Windows, et ResTeaM vérifie qu'il appartient bien au compte connecté (sinon il est rendu tout de suite) ;
  - ensuite, chaque changement de style, de photo ou de bannière part tout seul au bout d'1,2 s, et seulement ce qui a changé ;
  - « Arrêter le partage » demande une confirmation, puis efface tout ;
  - sur le profil d'un ami qui partage : son fond, son cadre, son effet, sa couleur, sa photo (via le cache disque, une fois par version) et sa bannière (lue en direct, CSP ouverte pour le serveur seulement). Cache de 10 minutes ;
  - les adresses de fichiers reçues doivent pointer vers le serveur, sinon elles sont refusées.
- Aperçu : un ami sur deux partage son profil (aurore, cadre de lunes, couleur dorée).

**À vérifier dans l'exe** : pinceau magique, puis « Partager mon profil », valider dans le navigateur, choisir une photo et une bannière. Un ami qui a ResTeaM doit voir ton profil ResTeaM. Vérifier aussi « Arrêter le partage ».

### Étape 20 — Notifications aux couleurs de ResTeaM (10 novembre 2026) — validée par Tom dans l'exe

- Les notifications de Windows sont remplacées par **des cartes ResTeaM**, dans une petite fenêtre `notifs` (`notifications.rs`, `src/notifs/FenetreNotifs.tsx`) :
  - sans cadre, transparente, toujours au-dessus, absente de la barre des tâches ;
  - elle ne prend **jamais le focus** (`focusable(false)`) : un jeu au premier plan le reste ;
  - elle prend la hauteur des cartes (Rust la place dans le coin choisi de l'écran principal, zone de travail sans la barre des tâches) et se cache quand il n'y a plus rien ;
  - elle est créée hors du fil principal (leçon du salon d'achat).
- Une carte par type :
  - **ami en jeu** : son avatar **animé** et son **cadre** d'objets Steam, un point vert qui bat, le visuel du jeu en fond, un clic ouvre son profil ;
  - **téléchargement terminé** et **mise à jour** : visuel et jaquette du jeu, bouton **Jouer** ;
  - **promo** : visuel, jaquette, badge **-50 %** qui rebondit, « 6,99 € au lieu de 13,99 € » ;
  - **ResTeaM** (essai) : une lune qui se balance.
- Les cartes arrivent en glissant depuis le bord, avec un reflet lunaire, et le visuel en fond dérive lentement. Une fine ligne montre le temps restant ; elle s'arrête quand la souris est dessus. La croix apparaît au survol. Au-delà de 4 cartes : « +N autres ».
- **Réglages** (Paramètres > ResTeaM au quotidien > Notifications) :
  - **ne pas déranger en jeu** (activé par défaut) : les cartes attendent la fin de la partie ;
  - coin de l'écran (4 choix) ;
  - durée (5, 7, 10 ou 15 s).
- Sécurité :
  - un clic n'ouvre qu'une page d'une liste fermée (`/jeu/<chiffres>`, `/profil/<17 chiffres>`, Téléchargements, Liste de souhaits…), vérifiée en Rust puis dans le front ;
  - « Jouer » passe par la construction vérifiée des liens `steam://` ;
  - les textes (pseudos, noms de jeux) sont affichés comme du texte ;
  - la fenêtre a sa propre capacité, réduite à `core:default`.
- En secours, si la fenêtre ne peut pas être créée, la notification de Windows s'affiche.
- Aperçu : `?notifs=1` montre les quatre cartes (`&coin=hd` pour un coin du haut).

**À vérifier dans l'exe** :
1. Paramètres, « Envoyer une notification d'essai » : la carte s'affiche dans le coin choisi sans voler le focus.
2. Lancer un jeu, puis faire arriver une notification : elle attend la fin de la partie.
3. Cliquer une carte : la bonne page de ResTeaM s'ouvre.

### Étape 21 — Journal des sessions (10 novembre 2026)

- **Enregistrement** (`journal.rs`) : chaque partie suivie par `jeu.rs` (jeu, début, fin) est gardée dans le cache **chiffré par le coffre-fort**, rangée par mois (`journal:2026-11`), sans date de péremption.
  - Les parties de moins d'une minute sont ignorées, ainsi que les doublons.
  - Garde-fou : 5 000 parties par mois au plus.
- **Robustesse** : pendant une partie, la session en cours est notée toutes les minutes. Si ResTeaM se ferme ou redémarre au milieu :
  - le jeu tourne encore au relancement : la partie continue avec son vrai début ;
  - le jeu est fermé : elle est enregistrée jusqu'à la dernière minute vue.
- **Page « Journal de jeu »** (`/journal`, dans le menu du logo et depuis le profil) :
  - périodes : 12 semaines, 6 mois, cette année, tout (2 ans) ;
  - chiffres : temps de jeu, nuits de jeu, plus longue partie (et son jeu), plus longue série de nuits d'affilée, série en cours ;
  - **calendrier des nuits de jeu** : une case par nuit, du lundi au dimanche, plus lumineuse quand Tom a joué longtemps (5 niveaux, jusqu'à la lune blanche qui brille au-delà de 4 h). La taille des cases s'adapte à la période, et aujourd'hui est entouré de vert ;
  - une partie commencée avant 6 h du matin compte pour la nuit d'avant ;
  - **détail d'une nuit** au clic : chaque partie avec sa jaquette, ses heures et sa durée ; un clic ouvre la fiche du jeu ;
  - **les plus joués** de la période, avec des jauges.
  - La partie en cours est ajoutée au calendrier en direct.
- **Profil** : section « Tes nuits de jeu » (12 semaines en petit, total, temps de cette nuit, bouton « Ouvrir le journal »).
- Le journal ne commence qu'aujourd'hui : Steam ne donne pas l'historique des parties, seulement les totaux. Il nourrira le ResTeaM Wrap.
- Aperçu : un journal simulé, stable d'un jour à l'autre.

**À vérifier dans l'exe** : lancer un jeu quelques minutes, le fermer, puis ouvrir Journal de jeu. La nuit doit s'allumer, avec la partie dans son détail.

### Étape 22 — La vraie lune et la roulette « Ce soir je joue à… » (10 novembre 2026)

- **La vraie lune** (`lib/lune.ts`, `components/Logo.tsx`) :
  - la phase est calculée sur le PC, sans Internet, avec le mois lunaire moyen (29,53 jours) depuis la nouvelle lune du 6 janvier 2000. Précision d'environ un jour : les pleines lunes du 26 octobre et du 24 novembre 2026 donnent 100 % ;
  - la lune du logo prend la forme réelle de ce soir, vue de l'hémisphère nord : croissant éclairé à droite quand elle grandit, quartiers, gibbeuses, pleine lune, puis croissant éclairé à gauche ;
  - la partie dans l'ombre garde un léger reflet (« lumière cendrée »), pour que la silhouette reste visible à la nouvelle lune. Les engrenages restent par-dessus ;
  - recalculée toutes les 30 minutes. Le menu du logo affiche « Nouvelle lune ce soir · 0 % éclairée » ;
  - le 10 novembre 2026, c'est nouvelle lune : le logo est presque éteint, et c'est voulu.
- **Roulette « Ce soir je joue à… »** (`pages/roulette/Roulette.tsx`) :
  - un bouton doré « Ce soir je joue à… » dans la Bibliothèque et à côté des onglets du ruban de l'accueil ;
  - filtres : installés (par défaut), favoris, jamais lancés, pas finis à 100 % (d'après le bilan des trophées). « Jamais lancés » et « pas finis » s'excluent. Le nombre de jeux dans la roue est affiché ;
  - côté « gambling » : le jeu est tiré au sort d'abord (hasard du système, `crypto.getRandomValues`), puis une bande de 56 jaquettes défile vite et ralentit pendant 6 secondes sous un repère lunaire doré qui pulse. L'arrêt tombe quelque part sur la jaquette, pas pile au centre, et les voisins du gagnant sont toujours d'autres jeux, pour le suspense ;
  - à l'arrêt : la jaquette gagnante grandit avec un liseré doré et un reflet, les autres s'effacent, une gerbe d'étoiles part du centre, puis « Ce soir, ce sera… » avec le nom ;
  - ensuite : « Jouer » (si le jeu est installé), « Voir la fiche » ou « L'installer », et « Relancer la roue » ;
  - tout en transform et opacité.

**À vérifier dans l'exe** : le logo (nouvelle lune ce soir, il grossira dans les jours qui viennent) et une partie de roulette.

### Étape 23 — Historique des patch notes, roue du soir, pile de la honte, prix par heure (10 novembre 2026)

- **Toutes les notes de mise à jour** (demande de Tom, « comme sur Steam ») : dans la section « Actus et patch notes » de la fiche, le bouton « Toutes les notes de mise à jour » ouvre une frise chronologique.
  - Toutes les annonces officielles du jeu, des plus récentes aux plus anciennes : date, titre, version, badge « Patch », première image de l'annonce, notes triées par catégorie (« Tout afficher » au-delà de 6 lignes), sinon un extrait du texte, et un lien vers l'annonce dans Steam.
  - Les plus anciennes se chargent en défilant, 10 à la fois : `ISteamNews/GetNewsForApp` avec `enddate`, vérifié sur Hades II (deux pages qui se suivent sans chevauchement). Cache d'une heure par page.
  - L'image n'est gardée que si elle est sur les serveurs d'images de Steam, en HTTPS.
- **La roue du soir** (demandes de Tom : plus visible, en haut à gauche, puis « trop de couleurs, dans la DA ») :
  - elle est en haut à gauche de l'accueil : une petite roue de casino qui tourne doucement (vite au survol), des lumières qui s'allument en chaîne, une flèche et une lune au centre, avec « La roue du soir · Ce soir je joue à… · Laisse la lune choisir » ;
  - couleurs de la DA : segments argent, bleu lunaire et charbon, liseré clair de lune. La fenêtre de la roulette passe aussi au bleu lunaire ;
  - plus compacte sur les écrans peu hauts (≤ 920 px), pour ne pas toucher le titre du hero ;
  - le bouton du ruban est retiré. Celui de la Bibliothèque reste.
  - **version premium** (retour de Tom : « trop brillant, trop clown ») : plus de pastille ni de couleurs. Il ne reste que la roue, en **verre sombre translucide** comme le reste de l'app : un cerclage gradué et des rayons fins gravés qui tournent lentement (vite au survol) derrière un **croissant de lune argenté et mat**, avec un fin repère en haut. « La roue du soir · Ce soir je joue à… » n'apparaît qu'au survol, en simple texte. La fenêtre de la roulette reprend le style sobre des autres fenêtres.
- **Ma collection** (`/collection`, menu du logo, bouton « Pile de la honte » de la Bibliothèque), deux onglets :
  - **Pile de la honte** :
    - les jeux jamais lancés, triés par note Steam, avec la note (verte au-dessus de 80 %), le prix et « Installé » ;
    - en tête : le nombre de jeux, leur valeur qui dort (prix de base du magasin), leur part de la bibliothèque, et « X sortis de la pile depuis le … » (point de départ gardé sur le PC) ;
    - « Tirer dans la pile » ouvre la roulette sur les jeux jamais lancés ;
  - **Prix par heure** :
    - prix de base du magasin divisé par les heures de jeu (jeux joués au moins 1 h) ;
    - en tête : coût moyen par heure, valeur de la bibliothèque, heures sur des jeux gratuits ;
    - classements des 10 plus rentables et des 10 moins rentables, avec une pastille vert / bleu / argent / rouge doux selon le prix par heure ;
    - avertissement : ce que Tom a vraiment payé (promo, lot, cadeau) peut être plus bas.
  - Prix et notes viennent du magasin, par paquets de 100 jeux, avec le cache existant.

**À vérifier dans l'exe** :
- l'historique des notes d'un jeu suivi (défiler jusqu'aux plus anciennes) ;
- la roue en haut à gauche de l'accueil ;
- Ma collection avec la vraie bibliothèque : nombre de jeux jamais lancés, et prix par heure d'Apex Legends (gratuit, donc compté dans les heures gratuites).

### Étape 24 — Notes de mise à jour en plein écran, carnet magique (10 novembre 2026)

- **Plein écran** (demande de Tom : « affichage complet, stylisé, mieux arrangé, légers effets ») :
  - fond : le visuel du jeu, flou et assombri, qui dérive très lentement, avec une lueur lunaire ;
  - à gauche, **la frise** de toutes les annonces : date, version, titre, point plein pour les patchs. Les plus anciennes se chargent en défilant ;
  - à droite, **l'annonce en grand** :
    - la bannière, qui zoome très lentement, et un clic pour l'agrandir ;
    - les badges, la date et le titre ;
    - les notes en **cartes par catégorie** (Nouveau, Équilibrage, Performances, Correctifs, Autre), sur deux colonnes, avec un petit croissant de couleur et le nombre de lignes ;
    - la **galerie de toutes les images** de l'annonce, agrandies au clic ;
    - un lien vers l'annonce dans Steam ;
  - « ↑ Plus récente / Plus ancienne ↓ », les flèches du clavier, et Échap pour fermer (puis pour fermer une image agrandie) ;
  - effets légers : entrée en fondu, cartes qui montent l'une après l'autre, fondu à chaque changement d'annonce.
- **Toutes les images** (« parfois il y a des images ») : Rust extrait toutes les images de l'annonce (`[img]…[/img]` et `[img src="…"]`), dans l'ordre et sans doublon, 16 au plus, seulement sur les serveurs d'images de Steam en HTTPS. Testé : doublons, images hors de Steam, balises piégées.
- **Accès** :
  - sur l'accueil, un nouveau bouton à côté de l'engrenage, avec l'icône **« carnet magique lunaire »** (`IconCarnet`) : un carnet à spirale, un croissant sur la couverture et une étincelle. Au survol, la couverture s'entrouvre et l'étincelle scintille ;
  - dans les **propriétés du jeu** (engrenage), un onglet **« Notes »** : les 5 dernières annonces, et « Toutes les notes de mise à jour » ;
  - sur la fiche, « Toutes les notes de mise à jour » ouvre aussi le plein écran.

**À vérifier dans l'exe** : ouvrir les notes d'un jeu suivi depuis l'accueil, regarder une annonce avec des images, et naviguer avec les flèches.

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
