import { test } from "node:test";
import assert from "node:assert/strict";
import {
  champsSignesComplets,
  etatValide,
  jetonDepuisEntete,
  nettoyerStyle,
  portValide,
  steamIdDepuisClaimedId,
  steamIdValide,
  typeDepuisOctets,
} from "../src/regles.js";

test("identifiants", () => {
  assert.ok(steamIdValide("76561198000000000"));
  assert.ok(!steamIdValide("7656119800000000"));
  assert.ok(!steamIdValide("76561198000000000/"));
  assert.ok(!steamIdValide(null));
  assert.equal(steamIdDepuisClaimedId("https://steamcommunity.com/openid/id/76561198000000000"), "76561198000000000");
  assert.equal(steamIdDepuisClaimedId("https://steamcommunity.com.evil.io/openid/id/76561198000000000"), null);
  assert.equal(steamIdDepuisClaimedId("http://steamcommunity.com/openid/id/76561198000000000"), null);
  assert.equal(steamIdDepuisClaimedId("https://steamcommunity.com/openid/id/76561198000000000?x"), null);
});

test("port, état, jeton", () => {
  assert.ok(portValide("49152") && portValide("1024") && portValide("65535"));
  assert.ok(!portValide("80") && !portValide("65536") && !portValide("1234/evil") && !portValide("") && !portValide(null));
  assert.ok(etatValide("a".repeat(32)) && !etatValide("A".repeat(32)) && !etatValide("a".repeat(31)) && !etatValide("a&jeton=x".padEnd(40, "a")));
  assert.equal(jetonDepuisEntete(`Bearer ${"f".repeat(64)}`), "f".repeat(64));
  assert.equal(jetonDepuisEntete(`Bearer ${"f".repeat(63)}`), null);
  assert.equal(jetonDepuisEntete(`Basic ${"f".repeat(64)}`), null);
  assert.equal(jetonDepuisEntete(null), null);
});

test("signature OpenID complète", () => {
  assert.ok(champsSignesComplets("signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle"));
  assert.ok(!champsSignesComplets("op_endpoint,claimed_id,identity,return_to"));
  assert.ok(!champsSignesComplets(undefined));
});

test("style nettoyé", () => {
  assert.deepEqual(nettoyerStyle({ fond: "aurore", cadre: "lune", effet: "pluie", accent: "#9FD8FF", avatarAnime: true, jeuFond: 730, pirate: "<script>" }), {
    fond: "aurore",
    cadre: "lune",
    effet: "pluie",
    accent: "#9fd8ff",
    avatarAnime: true,
    jeuFond: 730,
  });
  assert.deepEqual(nettoyerStyle({ fond: "javascript:", accent: "red", jeuFond: -1, avatarAnime: "oui" }), {});
  assert.deepEqual(nettoyerStyle({ jeuFond: null }), { jeuFond: null });
  assert.equal(nettoyerStyle([1]), null);
  assert.equal(nettoyerStyle("x"), null);
  assert.equal(nettoyerStyle(null), null);
});

test("type par les premiers octets", () => {
  const o = (...v) => new Uint8Array([...v, ...new Array(16).fill(0)]);
  assert.equal(typeDepuisOctets(o(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), "image/png");
  assert.equal(typeDepuisOctets(o(0xff, 0xd8, 0xff)), "image/jpeg");
  assert.equal(typeDepuisOctets(o(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)), "image/gif");
  assert.equal(typeDepuisOctets(o(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50)), "image/webp");
  assert.equal(typeDepuisOctets(o(0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70)), "video/mp4");
  assert.equal(typeDepuisOctets(o(0x1a, 0x45, 0xdf, 0xa3)), "video/webm");
  // HTML ou SVG déguisés : refusés.
  assert.equal(typeDepuisOctets(new TextEncoder().encode("<svg onload=alert(1)>")), null);
  assert.equal(typeDepuisOctets(new TextEncoder().encode("<!doctype html>")), null);
  assert.equal(typeDepuisOctets(new Uint8Array()), null);
});
