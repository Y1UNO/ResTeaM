# Audit de sécurité n° 2 : coffre-fort et campagne « tout faire planter » (9 novembre 2026)

Portée : tout le Rust (`src-tauri/src`), y compris les nouveautés du jour : paramètres de Steam, zone de notification, suivi du jeu, notifications, manette, trophées, fonds Wallpaper Engine en haute définition.

Méthode :
- lecture du code ;
- **tests de propriétés** (`proptest`) : chaque analyseur et chaque garde de sécurité reçoit 2 000 entrées tirées au hasard par test, soit plus de 50 000 cas par exécution ;
- **fichiers piégés** ;
- **tests de charge**.

Tout est dans `src-tauri/src/robustesse.rs` et tourne avec `cargo test --lib`.

## Résumé

| Zone | Verdict |
|---|---|
| Données sur le disque | **Chiffrées** (coffre-fort DPAPI) |
| Analyseur VDF (fichiers de Steam) | **Faille corrigée** : débordement de pile |
| Descriptions du Workshop (BBCode) | **Faille corrigée** : plantage sur du texte Unicode |
| Liens `steam://openurl` | **Durci** : adresse normalisée, identifiants refusés |
| Paquets `scene.pkg` (Wallpaper Engine) | Sûr, borné, éprouvé au hasard |
| Protocole `img` (plages, noms, chemins) | Sûr, éprouvé au hasard |
| Salon d'achat (adresses de départ) | Sûr, éprouvé au hasard |
| Paramètres de Steam, zone de notification, notifications | Sûrs (relus) |

Avec `panic = "abort"` dans l'exe, chaque plantage trouvé fermait ResTeaM d'un coup. Les deux plantages ci-dessous ont chacun leur test, pour qu'ils ne reviennent pas.

## 1. Coffre-fort (`src-tauri/src/coffre.rs`)

- Ce qui est chiffré : `session.json`, ainsi que **chaque valeur du cache SQLite**. Le cache contient aussi la file d'attente de Steam : installations, désinstallations et réglages en attente.
- Le chiffrement utilise la protection de données de Windows (DPAPI, `CryptProtectData`, portée « utilisateur courant », sans fenêtre) :
  - seule la session Windows de Tom peut relire ces données ;
  - un autre compte Windows, ou le fichier copié sur un autre PC, ne donne qu'un bloc illisible ;
  - ResTeaM ne stocke aucune clé : Windows s'en charge ;
  - un sel propre à ResTeaM est ajouté. Un autre programme de la même session ne déchiffre donc pas ces blocs par hasard.
- Format : `rstm1:` suivi du bloc en base64. Un bloc modifié est refusé, car DPAPI le vérifie (testé).
- Migration au démarrage :
  - les anciennes données en clair sont chiffrées une fois ;
  - un `VACUUM` efface ensuite leurs anciennes pages dans le fichier SQLite ;
  - un ancien fichier en clair reste lisible : rien n'est perdu.
- Ce qui reste hors du coffre-fort, volontairement :
  - la clé API, qui est déjà dans le Gestionnaire d'identifiants Windows ;
  - les cookies du salon d'achat, dans leur dossier WebView2 isolé, que WebView2 chiffre lui-même ;
  - `preferences.json`, qui ne contient que des interrupteurs ;
  - les images en cache (`images/`), publiques chez Steam.
- Tests : `coffre::aller_retour`, `coffre::ancien_format_et_blocs_abimes`, `cache::migration_du_coffre_fort`, `robustesse::coffre_fort_quelconque`.

## 2. Failles trouvées et corrigées

### Débordement de pile dans l'analyseur VDF (gravité moyenne)
- `vdf::lire` descendait dans chaque bloc `{ }` par récursion. Un `localconfig.vdf`, un `appmanifest` ou un `appworkshop_*.acf` piégé, avec des centaines de milliers de blocs imbriqués, faisait déborder la pile et fermait ResTeaM.
- Ces fichiers sont écrits par Steam, mais aussi par n'importe quel programme de la session : un mod ou un outil malveillant pourrait bloquer ResTeaM au démarrage.
- Correction : au-delà de 64 niveaux (les fichiers de Steam en ont moins de 10), le contenu est sauté **sans récursion**.
- Test : `vdf_imbrique_un_million_de_fois`, qui lit un million de niveaux en moins de 5 s, sans planter.

### Plantage sur une description du Workshop (gravité moyenne)
- `workshop::texte_simple` retire le BBCode des descriptions de mods. Un `[` jamais fermé faisait couper la chaîne au milieu d'un caractère Unicode (tamoul, emoji…), et un `[` seul en fin de texte coupait « à l'envers ».
- N'importe quel auteur de mod pouvait donc, par accident ou exprès, faire planter ResTeaM à l'ouverture de la vitrine du Workshop.
- Correction : un `[` sans `]` reste du texte normal.
- Trouvé par `robustesse::textes_quelconques`. Test de non-régression : `bbcode_jamais_ferme`.

### Liens `steam://openurl` (durcissement)
- Le lien envoyé à Steam reprenait l'adresse brute venue du front, pas l'adresse vérifiée.
- Il utilise maintenant l'adresse **normalisée** par l'analyseur d'URL : espaces et guillemets encodés. Les adresses avec identifiants (`https://x:y@store…`) sont refusées.
- Test : `liens::liens` et `robustesse::adresses_proches_de_steam`.

## 3. Ce qui a été éprouvé sans trouver de faille

- **Fichiers de Steam** : VDF quelconques ou presque valides, chaînes jamais fermées, accolades orphelines, BOM, `appworkshop`, `screenshots.vdf`, collections JSON.
- **Textes venus d'Internet** : BBCode et HTML tirés au hasard (patch notes, pages du magasin, configuration requise, langues).
- **Protocole `img`** :
  - plages `Range` géantes, négatives, multiples ou inversées : le résultat reste toujours dans le fichier ;
  - noms de fichiers : ce qui passe ne contient jamais `/`, `\`, `:`, `..` ni d'octet nul ;
  - chemins de captures : jamais de `..`, de `\` ni de lecteur.
- **`scene.pkg`** :
  - octets quelconques : un fichier trouvé est toujours à l'intérieur du paquet ;
  - table annonçant 20 000 fichiers mais tronquée, ou nom annoncé à 4 Go : refusés sans rien allouer.
- **Salon d'achat** : une adresse acceptée est toujours en HTTPS, sur un domaine officiel de Steam et sans identifiants. Cela vaut aussi pour les sosies (`steampowered.com.evil.io`, `evilsteampowered.com`, point final, autres schémas).
- **Liens `steam://`** : lobby, SteamID et adresse de serveur ne laissent passer que des chiffres, des points et des deux-points.
- **Connexion OpenID** : un identifiant extrait est toujours un SteamID valide (17 chiffres).
- **Suivi du jeu et notifications** : transitions entre jeux quelconques, clés de promo.

## 4. Charge

| Essai | Résultat |
|---|---|
| `libraryfolders.vdf` avec 5 000 jeux | lu en moins d'1 s |
| `appworkshop` avec 1 000 mods | lu en moins d'1 s |
| 20 Mo de patch notes | triés sans planter |
| VDF imbriqué un million de fois | lu en moins de 5 s (64 niveaux gardés) |

## 5. Relecture des nouveautés du jour

- **Paramètres de Steam** :
  - écrits seulement Steam fermé, par la file, après une copie `.resteam.bak` ;
  - les valeurs sont validées : limite plafonnée, compte de 17 chiffres ;
  - le dossier ouvert dans l'Explorateur doit figurer dans `libraryfolders.vdf`.
- **Démarrage avec Windows** : seules les valeurs `Steam` et `ResTeaM` de la clé `Run` de l'utilisateur sont touchées, avec le vrai chemin de `steam.exe` ou de l'exe actuel.
- **Zone de notification** :
  - les menus ne font qu'afficher la fenêtre ou changer de page (pages fixes) ;
  - « Quitter » est le seul moyen de fermer quand « Fermer = réduire » est actif.
- **Instance unique** : relancer l'exe remet la fenêtre existante à l'écran. Les arguments du second lancement ne sont jamais exécutés.
- **Notifications** :
  - ResTeaM s'inscrit sous `HKCU\Software\Classes\AppUserModelId\com.yiuno.resteam` (nom et icône) ;
  - le texte affiché vient de Steam (noms de jeux et d'amis), mais une notification Windows n'interprète ni script ni lien.
- **Trophées** : appels avec la clé API côté Rust uniquement. `GetAchievementsProgress` est refusé par Steam avec une clé (HTTP 405) ; on utilise donc `GetTopAchievementsForGames`. Les totaux ont été recoupés jeu par jeu, sans écart sur 6 jeux.
- **Capacités Tauri** : ajout de `set-fullscreen`, `is-fullscreen` et `set-webview-zoom` pour la fenêtre principale (mode Salon). Rien pour les pages distantes.
