// Serveur de partage des profils ResTeaM (Cloudflare Worker, D1, R2).
//
// - Connexion : le serveur vérifie lui-même la connexion Steam (OpenID 2.0, puis
//   `check_authentication` auprès de Steam), puis remet un jeton à ResTeaM par
//   127.0.0.1. La clé API Steam n'est jamais envoyée ici.
// - Chacun ne peut écrire que dans son propre profil (jeton → SteamID).
// - Les profils et fichiers sont lisibles par tous (c'est le but : les amis les voient).
// - Fichiers vérifiés par leurs premiers octets, servis avec `nosniff` et une CSP fermée.

import {
  NOMS_FICHIERS,
  TAILLE_MAX,
  TYPES,
  champsSignesComplets,
  etatValide,
  jetonDepuisEntete,
  nettoyerStyle,
  portValide,
  steamIdDepuisClaimedId,
  steamIdValide,
  typeDepuisOctets,
} from "./regles.js";

const FOURNISSEUR = "https://steamcommunity.com/openid/login";
const NS = "http://specs.openid.net/auth/2.0";
const SELECTION = "http://specs.openid.net/auth/2.0/identifier_select";
/** Jetons gardés par compte (les plus récents) : un par PC, à peu près. */
const JETONS_PAR_COMPTE = 5;
const STYLE_MAX = 16 * 1024;

const ENTETES_SURS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function json(donnees, statut = 200) {
  return new Response(JSON.stringify(donnees), {
    status: statut,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...ENTETES_SURS },
  });
}

function erreur(code, statut) {
  return json({ erreur: code }, statut);
}

function page(titre, texte, statut = 200) {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titre} · ResTeaM</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#09090a;color:#eef2ff;font:16px/1.5 system-ui,sans-serif}main{max-width:420px;padding:32px;border:1px solid rgba(238,242,255,.16);border-radius:24px;background:rgba(14,14,17,.9);text-align:center}h1{font-size:22px;margin:0 0 8px}p{color:#a9adb8;margin:0}</style></head>
<body><main><h1>${titre}</h1><p>${texte}</p></main></body></html>`;
  return new Response(html, {
    status: statut,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'", ...ENTETES_SURS },
  });
}

function hex(octets) {
  return [...new Uint8Array(octets)].map((o) => o.toString(16).padStart(2, "0")).join("");
}

async function empreinte(jeton) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(jeton)));
}

/** SteamID du jeton `Authorization: Bearer …`, ou `null`. */
async function compte(req, env) {
  const jeton = jetonDepuisEntete(req.headers.get("Authorization"));
  if (!jeton) return null;
  const ligne = await env.DB.prepare("SELECT steamid FROM jetons WHERE empreinte = ?1").bind(await empreinte(jeton)).first();
  return ligne?.steamid ?? null;
}

/** Profil public d'un joueur, avec les adresses de ses fichiers. */
async function profilPublic(env, origine, steamid) {
  const p = await env.DB.prepare("SELECT style, avatar, banniere, maj FROM profils WHERE steamid = ?1").bind(steamid).first();
  if (!p) return null;
  const fichier = (brut, nom) => {
    if (!brut) return null;
    const f = JSON.parse(brut);
    return { url: `${origine}/f/${steamid}/${nom}?v=${f.version}`, type: f.type, video: f.type.startsWith("video/") };
  };
  return { steamId: steamid, style: JSON.parse(p.style), avatar: fichier(p.avatar, "avatar"), banniere: fichier(p.banniere, "banniere"), maj: p.maj };
}

async function assurerProfil(env, steamid) {
  await env.DB.prepare("INSERT INTO profils (steamid, style, maj) VALUES (?1, '{}', ?2) ON CONFLICT(steamid) DO NOTHING").bind(steamid, Date.now()).run();
}

// ——— Connexion Steam ———

function retourAttendu(origine, port, etat) {
  return `${origine}/auth/retour?port=${port}&etat=${etat}`;
}

async function authDebut(url) {
  const port = url.searchParams.get("port");
  const etat = url.searchParams.get("etat");
  if (!portValide(port) || !etatValide(etat)) return page("Lien invalide", "Relance la connexion depuis ResTeaM.", 400);
  const vers = new URL(FOURNISSEUR);
  vers.search = new URLSearchParams({
    "openid.ns": NS,
    "openid.mode": "checkid_setup",
    "openid.return_to": retourAttendu(url.origin, port, etat),
    "openid.realm": url.origin,
    "openid.identity": SELECTION,
    "openid.claimed_id": SELECTION,
  }).toString();
  return Response.redirect(vers.toString(), 302);
}

async function authRetour(url, env) {
  const port = url.searchParams.get("port");
  const etat = url.searchParams.get("etat");
  if (!portValide(port) || !etatValide(etat)) return page("Lien invalide", "Relance la connexion depuis ResTeaM.", 400);
  const v = (k) => url.searchParams.get(k);
  if (v("openid.mode") === "cancel") return page("Connexion annulée", "Tu peux fermer cet onglet.");
  const idRevendique = v("openid.claimed_id");
  const steamid = steamIdDepuisClaimedId(idRevendique);
  const valide =
    v("openid.mode") === "id_res" &&
    v("openid.ns") === NS &&
    v("openid.op_endpoint") === FOURNISSEUR &&
    v("openid.return_to") === retourAttendu(url.origin, port, etat) &&
    v("openid.identity") === idRevendique &&
    champsSignesComplets(v("openid.signed")) &&
    steamid;
  if (!valide) return page("Connexion refusée", "La réponse de Steam n'a pas pu être vérifiée. Réessaie depuis ResTeaM.", 400);

  // Steam confirme lui-même la signature.
  const corps = new URLSearchParams();
  for (const [k, val] of url.searchParams) if (k.startsWith("openid.")) corps.append(k, k === "openid.mode" ? "check_authentication" : val);
  const rep = await fetch(FOURNISSEUR, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: corps.toString() });
  const texte = rep.ok ? await rep.text() : "";
  if (!texte.split("\n").some((l) => l.trim() === "is_valid:true")) {
    return page("Connexion refusée", "Steam n'a pas confirmé la connexion. Réessaie depuis ResTeaM.", 400);
  }

  const jeton = hex(crypto.getRandomValues(new Uint8Array(32)));
  const maintenant = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO jetons (empreinte, steamid, cree) VALUES (?1, ?2, ?3)").bind(await empreinte(jeton), steamid, maintenant),
    // Pas d'accumulation : seuls les jetons les plus récents de ce compte restent valides.
    env.DB.prepare(
      `DELETE FROM jetons WHERE steamid = ?1 AND empreinte NOT IN (SELECT empreinte FROM jetons WHERE steamid = ?1 ORDER BY cree DESC LIMIT ${JETONS_PAR_COMPTE})`,
    ).bind(steamid),
  ]);
  // Retour vers ResTeaM, sur ce PC uniquement.
  return Response.redirect(`http://127.0.0.1:${port}/partage?etat=${etat}&jeton=${jeton}`, 302);
}

// ——— Profil ———

async function ecrireStyle(req, env, steamid) {
  const taille = Number(req.headers.get("Content-Length") ?? 0);
  if (taille > STYLE_MAX) return erreur("trop_grand", 413);
  const texte = await req.text();
  if (texte.length > STYLE_MAX) return erreur("trop_grand", 413);
  let brut;
  try {
    brut = JSON.parse(texte);
  } catch {
    return erreur("json", 400);
  }
  const style = nettoyerStyle(brut);
  if (!style) return erreur("style", 400);
  await assurerProfil(env, steamid);
  await env.DB.prepare("UPDATE profils SET style = ?2, maj = ?3 WHERE steamid = ?1").bind(steamid, JSON.stringify(style), Date.now()).run();
  return json({ ok: true, style });
}

async function ecrireFichier(req, env, steamid, nom) {
  const max = TAILLE_MAX[nom];
  const annonce = Number(req.headers.get("Content-Length") ?? 0);
  if (!annonce || annonce > max) return erreur("taille", 413);
  const octets = await req.arrayBuffer();
  if (octets.byteLength === 0 || octets.byteLength > max) return erreur("taille", 413);
  const type = typeDepuisOctets(new Uint8Array(octets, 0, Math.min(16, octets.byteLength)));
  if (!type || !TYPES[nom].includes(type)) return erreur("format", 415);
  await env.FICHIERS.put(`profils/${steamid}/${nom}`, octets, { httpMetadata: { contentType: type } });
  const infos = { type, version: Date.now(), taille: octets.byteLength };
  await assurerProfil(env, steamid);
  await env.DB.prepare(`UPDATE profils SET ${nom} = ?2, maj = ?3 WHERE steamid = ?1`).bind(steamid, JSON.stringify(infos), Date.now()).run();
  return json({ ok: true, ...infos });
}

async function retirerFichier(env, steamid, nom) {
  await env.FICHIERS.delete(`profils/${steamid}/${nom}`);
  await env.DB.prepare(`UPDATE profils SET ${nom} = NULL, maj = ?2 WHERE steamid = ?1`).bind(steamid, Date.now()).run();
  return json({ ok: true });
}

/** Désactiver le partage : tout ce qui concerne ce compte est effacé. */
async function toutEffacer(env, steamid) {
  await env.FICHIERS.delete(NOMS_FICHIERS.map((n) => `profils/${steamid}/${n}`));
  await env.DB.batch([
    env.DB.prepare("DELETE FROM profils WHERE steamid = ?1").bind(steamid),
    env.DB.prepare("DELETE FROM jetons WHERE steamid = ?1").bind(steamid),
  ]);
  return json({ ok: true });
}

async function servirFichier(req, env, steamid, nom) {
  const objet = await env.FICHIERS.get(`profils/${steamid}/${nom}`, { range: req.headers });
  if (!objet) return new Response("introuvable", { status: 404, headers: ENTETES_SURS });
  const h = new Headers(ENTETES_SURS);
  objet.writeHttpMetadata(h);
  h.set("ETag", objet.httpEtag);
  h.set("Accept-Ranges", "bytes");
  // Adresse versionnée (?v=) : le fichier ne change jamais à cette adresse.
  h.set("Cache-Control", "public, max-age=31536000, immutable");
  h.set("Content-Security-Policy", "default-src 'none'; sandbox");
  h.set("Content-Disposition", "inline");
  const r = objet.range;
  if (r && req.headers.has("Range") && "offset" in r) {
    const fin = r.offset + r.length - 1;
    h.set("Content-Range", `bytes ${r.offset}-${fin}/${objet.size}`);
    h.set("Content-Length", String(r.length));
    return new Response(objet.body, { status: 206, headers: h });
  }
  h.set("Content-Length", String(objet.size));
  return new Response(objet.body, { status: 200, headers: h });
}

// ——— Routes ———

async function router(req, env) {
  const url = new URL(req.url);
  const morceaux = url.pathname.split("/").filter(Boolean);
  const [a, b, c] = morceaux;
  const m = req.method;

  if (m === "GET" && morceaux.length === 0) return page("ResTeaM", "Serveur de partage des profils ResTeaM.");
  if (m === "GET" && a === "auth" && b === "debut") return authDebut(url);
  if (m === "GET" && a === "auth" && b === "retour") return authRetour(url, env);

  if (m === "GET" && a === "profils" && morceaux.length === 2) {
    if (!steamIdValide(b)) return erreur("steamid", 400);
    const p = await profilPublic(env, url.origin, b);
    return p ? json(p) : erreur("absent", 404);
  }
  if ((m === "GET" || m === "HEAD") && a === "f" && morceaux.length === 3) {
    if (!steamIdValide(b) || !NOMS_FICHIERS.includes(c)) return erreur("chemin", 400);
    return servirFichier(req, env, b, c);
  }

  // Tout le reste demande une connexion.
  const steamid = await compte(req, env);
  if (!steamid) return erreur("non_connecte", 401);
  if (m === "GET" && a === "moi") return json({ steamId: steamid, profil: await profilPublic(env, url.origin, steamid) });
  if (m === "PUT" && a === "profil" && morceaux.length === 1) return ecrireStyle(req, env, steamid);
  if (m === "DELETE" && a === "profil" && morceaux.length === 1) return toutEffacer(env, steamid);
  if (a === "fichiers" && morceaux.length === 2 && NOMS_FICHIERS.includes(b)) {
    if (m === "PUT") return ecrireFichier(req, env, steamid, b);
    if (m === "DELETE") return retirerFichier(env, steamid, b);
  }
  if (m === "POST" && a === "deconnexion") {
    const jeton = jetonDepuisEntete(req.headers.get("Authorization"));
    await env.DB.prepare("DELETE FROM jetons WHERE empreinte = ?1").bind(await empreinte(jeton)).run();
    return json({ ok: true });
  }
  return erreur("introuvable", 404);
}

export default {
  async fetch(req, env) {
    try {
      return await router(req, env);
    } catch {
      // Jamais de détail interne dans la réponse.
      return erreur("interne", 500);
    }
  },
};
