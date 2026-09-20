// Ouverture de Waze et de Google Maps depuis l'application chauffeur.
// Le propriétaire a signalé le 20 septembre 2026 que le chauffeur arrivait au mauvais endroit,
// au départ comme à l'arrivée. Ces tests figent les deux règles qui corrigent cela :
// on ne guide par coordonnées que sur un point sûr, et une recherche par texte laisse le
// chauffeur choisir au lieu de le lancer vers le premier résultat venu.
import { test } from "node:test";
import assert from "node:assert/strict";

const { chooseTarget, buildWazeUrl, buildGoogleMapsUrl, navigationHint } =
  await import("../../apps/driver-app/src/lib/navigationLinks.js");

const ADRESSE = "1580 Avenue Bourgogne, Chambly, QC J3L 2Y7";

test("un point vérifié du catalogue lance le guidage par coordonnées", () => {
  const t = chooseTarget({ address: "Aéroport YUL", lat: 45.4577, lng: -73.7497, confidence: "verifie" });
  assert.equal(t.kind, "coords");
  assert.equal(t.value, "45.4577,-73.7497");
  assert.match(buildWazeUrl(t).natif, /^waze:\/\/\?ll=45\.4577,-73\.7497&navigate=yes$/);
});

test("un point à la porte est assez sûr pour guider directement", () => {
  const t = chooseTarget({ address: ADRESSE, lat: 45.45, lng: -73.28, confidence: "porte" });
  assert.equal(t.kind, "coords");
});

test("un point approximatif ou de tronçon de rue fait naviguer sur l'adresse écrite", () => {
  for (const confidence of ["rue", "lieu", "approx", null, undefined]) {
    const t = chooseTarget({ address: ADRESSE, lat: 45.45, lng: -73.28, confidence });
    assert.equal(t.kind, "text", String(confidence));
    assert.equal(t.value, ADRESSE);
  }
});

test("une recherche par texte n'impose pas le guidage : le chauffeur voit les résultats", () => {
  const liens = buildWazeUrl(chooseTarget({ address: ADRESSE }));
  assert.ok(!liens.natif.includes("navigate=yes"), "c'est ce qui envoyait le chauffeur vers une devinette");
  assert.ok(liens.natif.startsWith("waze://?q="));
  assert.ok(liens.web.startsWith("https://waze.com/ul?q="));
});

test("l'adresse est encodée, virgules et accents compris", () => {
  const liens = buildWazeUrl(chooseTarget({ address: "12 Rue de l'Église, Chambly, QC" }));
  assert.ok(!liens.natif.includes(" "), liens.natif);
  assert.ok(liens.natif.includes("%C3%89glise") || liens.natif.includes("%C3%A9glise"), liens.natif);
});

test("Google Maps reçoit le bon lien selon le téléphone", () => {
  const cible = chooseTarget({ address: ADRESSE });
  assert.ok(buildGoogleMapsUrl(cible, "android").natif.startsWith("google.navigation:q="));
  assert.ok(buildGoogleMapsUrl(cible, "ios").natif.startsWith("comgooglemaps://?daddr="));
  assert.ok(buildGoogleMapsUrl(cible, "web").web.includes("/maps/dir/?api=1&destination="));
});

test("sans adresse mais avec des coordonnées, on navigue quand même", () => {
  const t = chooseTarget({ address: "", lat: 45.45, lng: -73.28, confidence: "approx" });
  assert.equal(t.kind, "coords");
});

test("sans rien du tout, aucun lien n'est fabriqué", () => {
  assert.equal(chooseTarget({}), null);
  assert.equal(chooseTarget({ address: "   " }), null);
  assert.equal(buildWazeUrl(null), null);
  assert.equal(buildGoogleMapsUrl(null, "ios"), null);
});

test("le chauffeur sait s'il part vers un point exact ou vers une adresse à vérifier", () => {
  assert.match(navigationHint(chooseTarget({ address: ADRESSE, lat: 1, lng: 2, confidence: "porte" })), /exact/i);
  assert.match(navigationHint(chooseTarget({ address: ADRESSE })), /vérifiez le numéro/i);
  assert.match(navigationHint(null), /Aucune adresse/i);
});

test("l'iPhone est autorisé à ouvrir Waze et Google Maps", async () => {
  const fs = await import("fs");
  const app = JSON.parse(fs.readFileSync(new URL("../../apps/driver-app/app.json", import.meta.url), "utf8"));
  const schemes = app.expo.ios.infoPlist.LSApplicationQueriesSchemes;
  // Sans cette déclaration, l'iPhone répond « application absente » et retombe sur le site web.
  assert.ok(schemes.includes("waze"), "waze doit être déclaré");
  assert.ok(schemes.includes("comgooglemaps"), "comgooglemaps doit être déclaré");
});
