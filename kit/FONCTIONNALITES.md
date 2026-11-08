# Fonctionnalités et données

## Sources de données

| Besoin | Source |
|---|---|
| Connexion | Steam OpenID → SteamID64 |
| Profil, avatar, statut, jeu en cours | `ISteamUser/GetPlayerSummaries` |
| Amis | `ISteamUser/GetFriendList` (+ `GetPlayerSummaries` pour les statuts) |
| Bibliothèque + temps de jeu | `IPlayerService/GetOwnedGames` (include_appinfo) |
| Joué récemment | `IPlayerService/GetRecentlyPlayedGames` |
| Succès | `ISteamUserStats/GetPlayerAchievements` + `GetSchemaForGame` |
| Niveau, XP, badges | `IPlayerService/GetSteamLevel`, `IPlayerService/GetBadges` |
| Actus / patch notes | `ISteamNews/GetNewsForApp` |
| Fiche magasin | `store.steampowered.com/api/appdetails?appids=<id>&cc=fr&l=french` |
| Accueil magasin | `store.steampowered.com/api/featured` et `featuredcategories` |
| Avis | `store.steampowered.com/appreviews/<id>?json=1` |
| Catalogue complet | `IStoreService/GetAppList` |
| Joueurs en ligne | `ISteamUserStats/GetNumberOfCurrentPlayers` (par jeu) |
| Jeux installés | Lecture locale : `libraryfolders.vdf` + `appmanifest_<id>.acf` |
| Images | CDN Steam (header, library_600x900, library_hero, captures) |

Toujours **mettre en cache** (bibliothèque, fiches, images) et gérer les profils privés et les erreurs réseau proprement.

## Actions (liens `steam://`)

| Action | Lien |
|---|---|
| Jouer | `steam://rungameid/<appid>` |
| Installer | `steam://install/<appid>` |
| Ouvrir la page magasin dans Steam (achat) | `steam://store/<appid>` |
| Ajouter un ami | `steam://friends/add/<steamid64>` |
| Rejoindre un lobby | `steam://joinlobby/<appid>/<lobbyid>/<steamid64>` |
| Rejoindre un serveur | `steam://connect/<ip:port>` |

Le bouton **Rejoindre** n'apparaît que si l'API renvoie un lobby ou un serveur joignable.

## Rangs de temps de jeu (par jeu)

| Heures | Rang |
|---|---|
| 0 h | Novice |
| 10 h | I · Éveillé |
| 50 h | II · Initié |
| 100 h | III · Habitué |
| 250 h | IV · Vétéran |
| 500 h | V · Expert |
| 1 000 h | VI · Maître |
| 2 000 h | VII · Légende |
| 5 000 h | VIII · Mythe |
| 10 000 h | IX · Éternel |

- **Jauge** : 9 segments arrondis, un par palier. Les paliers atteints sont pleins et le palier en cours se remplit au prorata. Texte : « Prochain : Initié à 50 h · encore 2 h ».
- Le badge du rang en chiffres romains apparaît sur la jaquette (bibliothèque) et à côté du temps de jeu (hero, profil).
- Le profil montre combien de jeux sont dans chaque rang.

## Tri automatique des patch notes

On découpe l'annonce (`GetNewsForApp`, en nettoyant le BBCode et le HTML) en lignes et en puces, puis on classe chaque ligne par mots-clés (FR et EN, insensibles à la casse) :

| Catégorie | Mots-clés (exemples) |
|---|---|
| Nouveau | new, added, add, introducing, nouveau, ajout, ajouté |
| Équilibrage | balance, buff, nerf, adjusted, tweak, équilibrage, ajusté |
| Performances | performance, fps, optimiz, memory, loading, optimis, chargement |
| Correctifs | fix, fixed, bug, crash, issue, resolved, correctif, corrigé |
| Autre | tout le reste |

On affiche ensuite le panneau patch notes avec une section par catégorie non vide, et un lien vers l'annonce complète dans Steam.

## Achat (règle de sécurité)

**Acheter** n'achète jamais dans l'app. On affiche un popup clair (« Pour ta sécurité, le paiement se fait directement dans Steam ») puis on ouvre `steam://store/<appid>`.
