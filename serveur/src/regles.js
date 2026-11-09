// Règles du serveur de partage (sans dépendance au Worker : testées avec `node --test`).

export const FONDS = ["steam", "banniere", "avatar", "nebuleuse", "aurore", "jeu"];
export const CADRES = ["steam", "aucun", "lune", "lianes", "engrenages", "aura"];
export const EFFETS = ["pluie", "lucioles", "etoiles", "aucun"];
export const NOMS_FICHIERS = ["avatar", "banniere"];

/** Taille maximale de chaque fichier (le Worker garde le fichier en mémoire pour le vérifier). */
export const TAILLE_MAX = { avatar: 15 * 1024 * 1024, banniere: 60 * 1024 * 1024 };

/** Types acceptés pour chaque fichier. */
export const TYPES = {
  avatar: ["image/png", "image/jpeg", "image/gif", "image/webp", "video/mp4", "video/webm"],
  banniere: ["image/png", "image/jpeg", "image/gif", "image/webp", "video/mp4", "video/webm"],
};

/** SteamID64 : exactement 17 chiffres. */
export function steamIdValide(id) {
  return typeof id === "string" && /^\d{17}$/.test(id);
}

/** Port local de ResTeaM (127.0.0.1) : un port non réservé. */
export function portValide(p) {
  if (typeof p !== "string" || !/^\d{4,5}$/.test(p)) return false;
  const n = Number(p);
  return n >= 1024 && n <= 65535;
}

/** Jeton d'état choisi par ResTeaM : 32 à 64 caractères hexadécimaux. */
export function etatValide(e) {
  return typeof e === "string" && /^[0-9a-f]{32,64}$/.test(e);
}

/** Jeton de connexion : 64 caractères hexadécimaux. */
export function jetonValide(j) {
  return typeof j === "string" && /^[0-9a-f]{64}$/.test(j);
}

/** `https://steamcommunity.com/openid/id/<17 chiffres>` → SteamID64, et rien d'autre. */
export function steamIdDepuisClaimedId(c) {
  const m = typeof c === "string" ? /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(c) : null;
  return m ? m[1] : null;
}

/** Champs que la signature OpenID de Steam doit couvrir. */
export const CHAMPS_SIGNES = ["op_endpoint", "claimed_id", "identity", "return_to", "response_nonce", "assoc_handle"];

export function champsSignesComplets(signes) {
  const liste = String(signes ?? "")
    .split(",")
    .map((s) => s.trim());
  return CHAMPS_SIGNES.every((c) => liste.includes(c));
}

/**
 * Style de profil reçu de ResTeaM : seules les clés connues, avec des valeurs connues,
 * sont gardées. Renvoie `null` si ce n'est pas un objet.
 */
export function nettoyerStyle(x) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const s = {};
  if (FONDS.includes(x.fond)) s.fond = x.fond;
  if (CADRES.includes(x.cadre)) s.cadre = x.cadre;
  if (EFFETS.includes(x.effet)) s.effet = x.effet;
  if (typeof x.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(x.accent)) s.accent = x.accent.toLowerCase();
  if (typeof x.avatarAnime === "boolean") s.avatarAnime = x.avatarAnime;
  if (x.jeuFond === null) s.jeuFond = null;
  else if (Number.isInteger(x.jeuFond) && x.jeuFond > 0 && x.jeuFond < 2 ** 31) s.jeuFond = x.jeuFond;
  return s;
}

/** Type d'un fichier d'après ses premiers octets (jamais d'après ce que dit l'envoyeur). */
export function typeDepuisOctets(o) {
  const b = o instanceof Uint8Array ? o : new Uint8Array(o);
  const debut = (...v) => v.every((x, i) => b[i] === x);
  if (b.length >= 8 && debut(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (b.length >= 3 && debut(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (b.length >= 6 && debut(0x47, 0x49, 0x46, 0x38) && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return "image/gif";
  if (b.length >= 12 && debut(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "video/mp4";
  if (b.length >= 4 && debut(0x1a, 0x45, 0xdf, 0xa3)) return "video/webm";
  return null;
}

/** Lit `Authorization: Bearer <jeton>`. */
export function jetonDepuisEntete(h) {
  const m = typeof h === "string" ? /^Bearer ([0-9a-f]{64})$/.exec(h.trim()) : null;
  return m ? m[1] : null;
}
