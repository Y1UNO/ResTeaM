# Serveur de partage des profils ResTeaM

Petit serveur Cloudflare (Worker, base D1, stockage R2, offre gratuite) qui permet aux amis de voir la photo, la bannière et le style ResTeaM d'un joueur.

Adresse : `https://resteam-profils.resteam.workers.dev`

## Fonctionnement

1. Dans ResTeaM, « Partager mon profil » ouvre le navigateur sur `/auth/debut?port=…&etat=…`.
2. Le serveur envoie vers la connexion Steam (OpenID 2.0). Au retour (`/auth/retour`), il vérifie la réponse **lui-même** : champs, signature couvrant les champs utilisés, puis `check_authentication` auprès de Steam.
3. Il crée un jeton (256 bits, seule son empreinte SHA-256 est gardée) et renvoie le navigateur vers `http://127.0.0.1:<port>/partage` : ResTeaM range le jeton dans le Gestionnaire d'identifiants Windows.
4. Avec ce jeton, ResTeaM écrit **uniquement** dans le profil de ce SteamID.

La clé API Steam n'est jamais envoyée au serveur.

## Routes

| Méthode | Chemin | Accès | Rôle |
|---|---|---|---|
| GET | `/profils/<steamid>` | public | style et adresses des fichiers |
| GET | `/f/<steamid>/<avatar\|banniere>?v=…` | public | fichier (plages d'octets, cache immuable) |
| GET | `/moi` | jeton | SteamID du jeton et profil |
| PUT | `/profil` | jeton | style (JSON nettoyé, 16 Ko max) |
| PUT / DELETE | `/fichiers/<avatar\|banniere>` | jeton | photo ou bannière (PNG, JPEG, GIF, WebP, MP4, WebM, vérifiés par leurs premiers octets ; 15 Mo et 60 Mo max) |
| DELETE | `/profil` | jeton | arrêter le partage : tout est effacé, jetons compris |
| POST | `/deconnexion` | jeton | révoque ce jeton |

## Commandes

```bash
npm test          # règles (node --test)
npx wrangler dev  # serveur local (D1 et R2 simulés)
npm run schema    # crée les tables dans la vraie base
npx wrangler deploy
```
