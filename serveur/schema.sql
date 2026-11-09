-- Base D1 du serveur de partage des profils ResTeaM.

-- Jetons de connexion : seule leur empreinte SHA-256 est gardée (un jeton volé dans
-- la base ne sert à rien).
CREATE TABLE IF NOT EXISTS jetons (
  empreinte TEXT PRIMARY KEY,
  steamid TEXT NOT NULL,
  cree INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS jetons_steamid ON jetons (steamid, cree);

-- Profil partagé : style (JSON nettoyé), fichiers (type, version, taille en JSON).
CREATE TABLE IF NOT EXISTS profils (
  steamid TEXT PRIMARY KEY,
  style TEXT NOT NULL DEFAULT '{}',
  avatar TEXT,
  banniere TEXT,
  maj INTEGER NOT NULL
);
