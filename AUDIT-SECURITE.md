# Audit de sécurité — ResTeaM (étape 9, 9 novembre 2026)

Portée : tout le code (Rust `src-tauri/src`, front `src`), la configuration Tauri et les dépendances.
Méthode : lecture du code, tests automatiques, `npm audit`, `cargo audit` (base RustSec).

## Résumé

Aucune faille grave trouvée. Six durcissements ont été faits, détaillés plus bas.

| Zone | Verdict |
|---|---|
| Clé Steam Web API | Sûre |
| Connexion Steam (OpenID) | Sûre, durcie |
| Session | Sûre |
| Liens `steam://` et pages ouvertes | Sûrs |
| Installation / désinstallation (fichiers) | Sûres, durcies |
| Cache d'images (`img.localhost`) | Sûr, durci |
| Fenêtre, capacités Tauri, CSP | Sûres, CSP durcie |
| Dépendances | Voir la dernière section |

## Ce qui a été vérifié

### Clé Steam Web API
- Elle est rangée dans le Gestionnaire d'identifiants Windows (`keyring`). Elle n'est jamais écrite sur le disque, dans le cache, le dépôt ou un journal.
- Elle ne quitte jamais le Rust : le front sait seulement si elle existe.
- Toutes les erreurs réseau passent par `without_url()` : l'adresse, qui contient la clé, n'apparaît jamais dans un message d'erreur.
- Aucun `println!` / `eprintln!` hors des tests, à part deux messages de la file Steam, sans donnée sensible.

### Connexion Steam (OpenID 2.0)
- Le serveur local écoute uniquement sur `127.0.0.1`, sur un port libre, et ne vit que pendant la connexion.
- Un jeton d'état aléatoire (128 bits) est exigé dans `return_to`.
- Vérifiés : `mode`, `ns`, `op_endpoint` (Steam), `return_to` exact, `claimed_id` = `identity`, SteamID64 à 17 chiffres.
- La signature est confirmée par Steam (`check_authentication`).
- **Durci** : la liste `openid.signed` doit couvrir `op_endpoint`, `claimed_id`, `identity`, `return_to`, `response_nonce` et `assoc_handle`. Sans ça, une réponse signée qui ne couvrirait pas ces champs serait refusée. Un test le couvre.

### Session
- Le fichier de session contient seulement le SteamID, aucun mot de passe ni jeton.

### Liens et pages externes
- Le front n'a pas accès au plugin d'ouverture : seules les commandes Rust ouvrent des liens.
- Les liens `steam://` sont construits par le Rust à partir de paramètres vérifiés (appid, lobby, SteamID, IP:port).
- Les pages web sont limitées à `store.steampowered.com`, `steamcommunity.com` et `help.steampowered.com`, en HTTPS.

### Installation, désinstallation, raccourcis
- Un manifeste n'est écrit que dans une bibliothèque Steam déclarée (comparaison exacte des chemins). Le jeu doit être sur le compte et ne pas être déjà installé.
- **Durci** : le nom écrit dans le manifeste et dans les raccourcis vient maintenant de Steam, plus du front. Il était déjà nettoyé (caractères interdits, guillemets échappés).
- Désinstallation :
  - le dossier est supprimé seulement si `installdir` est un simple nom (ni `..`, ni `\`, ni `/`, ni lecteur) et si le chemin résolu reste dans `steamapps\common` ;
  - les jonctions et liens ne sont pas suivis (`remove_dir_all` de Rust, corrigé depuis la CVE-2022-21658) ;
  - les raccourcis ne sont retirés que si leur cible est exactement `steam://rungameid/<id>`.
- **Durci** : les composants partagés de Steam (redistribuables) ne peuvent pas être désinstallés.
- Le redémarrage de Steam attend la fin du jeu en cours. Steam est relancé sans hériter d'aucune poignée de ResTeaM.

### Cache d'images (`http://img.localhost/…`)
- Seules les adresses HTTPS des CDN de Steam (`*.steamstatic.com`, `steamcdn-a.akamaihd.net`, `*.steamusercontent.com`) sont acceptées. Le protocole ne peut pas servir de relais vers un autre site.
- Le nom de fichier est une empreinte de l'adresse : aucun chemin ne vient de la requête.
- L'écriture est atomique (fichier temporaire, puis renommage), et le cache est limité à 800 Mo.
- **Durci** : une image de plus de 25 Mo est refusée, pour qu'une réponse anormale ne remplisse pas la mémoire.

### Fenêtre, capacités, CSP
- Capacités Tauri minimales : `core:default` et le déplacement, la réduction, l'agrandissement et la fermeture de la fenêtre.
- Outils de développement absents de l'exe de production.
- CSP :
  - scripts `'self'` uniquement ;
  - images limitées au cache local et aux CDN de Steam ;
  - réseau limité à l'IPC et au CDN des bandes-annonces ;
  - hls.js tourne sans worker.
- **Durci** : ajout de `object-src 'none'`, `base-uri 'self'`, `frame-src 'none'`, `form-action 'none'` et `worker-src 'none'`.
- Le faux back-end de l'aperçu (`apercu.ts`) n'est chargé que hors de Tauri (navigateur). Dans l'exe, il n'est jamais importé.

### Entrées des commandes
- `profil_joueur` : SteamID à 17 chiffres.
- `rayon_magasin` : `gratuits` ou `tag:<chiffres>`.
- `recherche_magasin` : 2 à 60 caractères.
- Listes d'appids plafonnées (100 à 150).
- Bibliothèque d'installation vérifiée.

### Nettoyage
- **Retiré** : la page de test `/donnees` et son entrée « Données Steam (test) » dans le menu du logo.

## Dépendances

- `npm audit` (production et développement) : **0 vulnérabilité**.
- `cargo audit` (506 dépendances) : **0 vulnérabilité**, 5 avertissements sans effet sur l'exe Windows :
  - `glib` (« unsound »), `zbus_names`, `zvariant` et `zvariant_derive` (« non maintenus ») : ces dépendances de Tauri servent sous Linux (GTK, D-Bus) et ne sont pas compilées dans l'exe Windows ;
  - `proc-macro-error` (« non maintenu ») : il ne sert qu'au moment de la compilation et n'est pas dans l'exe.
  - À revoir quand Tauri mettra ces dépendances à jour.

## À garder en tête

- La liste de souhaits, l'achat et l'abonnement au Workshop passent par Steam : l'app ne manipule jamais de session web (cookies) Steam.
- Si un jour l'app est partagée, signer l'exe. Un exe non signé déclenche SmartScreen.
