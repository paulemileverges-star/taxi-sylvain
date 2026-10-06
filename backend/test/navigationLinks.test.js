// Ouverture de Waze et de Google Maps depuis l'application chauffeur.
// Le propriétaire a signalé le 20 septembre 2026 que le chauffeur arrivait au mauvais endroit,
// au départ comme à l'arrivée. Ces tests figent les deux règles qui corrigent cela :
// on ne guide par coordonnées que sur un point sûr, et une recherche par texte laisse le
// chauffeur choisir au lieu de le lancer vers le premier résultat venu.
import { test } from "node:test";
import assert from "node:assert/strict";

const { chooseTarget, buildWazeUrl, buildGoogleMapsUrl, navigationHint, etapesDeNavigation } =
  await import("../../apps/driver-app/src/lib/navigationLinks.js");

// 6 octobre 2026 : « en ouvrant Google Maps, le chauffeur n'a pas l'adresse du client telle
// qu'indiquée, c'est une autre adresse ». Google Maps reçoit désormais l'adresse écrite.
test("Google Maps reçoit l'adresse écrite, même quand un point « porte » existe", () => {
  const t = chooseTarget({ address: "1580 Avenue Bourgogne, Chambly, QC J3L 2Y7", lat: 45.45, lng: -73.28, confidence: "porte" }, "google");
  assert.equal(t.kind, "text");
  assert.equal(t.value, "1580 Avenue Bourgogne, Chambly, QC J3L 2Y7");
  const liens = buildGoogleMapsUrl(t, "android");
  assert.equal(liens.natif, "google.navigation:q=1580%20Avenue%20Bourgogne%2C%20Chambly%2C%20QC%20J3L%202Y7");
});

test("Google Maps garde les coordonnées d'un point de catalogue vérifié (YUL Arrivées, P4)", () => {
  const t = chooseTarget({ address: "975 Boulevard Roméo-Vachon Nord (Arrivées), Dorval, QC H4Y 1H1", lat: 45.457445, lng: -73.750134, confidence: "verifie" }, "google");
  assert.equal(t.kind, "coords");
  assert.equal(buildGoogleMapsUrl(t, "android").natif, "google.navigation:q=45.457445,-73.750134");
});

test("le lieu Google choisi dans la liste est transmis à Google Maps", () => {
  const t = chooseTarget({ address: "1580 Avenue Bourgogne, Chambly, QC", placeId: "ChIJ_lieu_test" }, "google");
  assert.match(buildGoogleMapsUrl(t, "web").web, /destination_place_id=ChIJ_lieu_test/);
});

test("avec des arrêts, Google Maps ouvre tout l'itinéraire dans l'ordre", () => {
  const dest = chooseTarget({ address: "YUL", lat: 45.457445, lng: -73.750134, confidence: "verifie" }, "google");
  const arrets = [chooseTarget({ address: "34 Rue Saint-Charles Ouest, Longueuil" }, "google"), chooseTarget({ address: "100 Boulevard de Mortagne, Boucherville" }, "google")];
  const liens = buildGoogleMapsUrl(dest, "android", arrets);
  assert.equal(liens.natif, liens.web, "seul le lien https accepte plusieurs arrêts");
  assert.match(liens.web, /waypoints=34%20Rue%20Saint-Charles%20Ouest%2C%20Longueuil%7C100%20Boulevard%20de%20Mortagne%2C%20Boucherville/);
  assert.match(liens.web, /dir_action=navigate/);
});

test("les étapes de navigation suivent la course : le client, puis chaque arrêt, puis la destination", () => {
  const ride = {
    status: "EN_ROUTE", pickupAddress: "Chez le client", destAddress: "YUL", destLat: 45.457445, destLng: -73.750134, destConfidence: "verifie",
    stops: [{ address: "Chez l'ami du client", lat: 45.5, lng: -73.5, confidence: "porte" }],
  };
  assert.deepEqual(etapesDeNavigation(ride).map((e) => e.titre), ["Prise en charge du client"]);
  const partie = etapesDeNavigation({ ...ride, status: "STARTED" });
  assert.deepEqual(partie.map((e) => e.titre), ["Arrêt 1", "Destination"]);
  assert.equal(partie[0].point.address, "Chez l'ami du client");
  assert.equal(partie[1].point.confidence, "verifie");
});

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
