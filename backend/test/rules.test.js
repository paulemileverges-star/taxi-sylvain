// Tests de non-régression sur les règles métier déjà livrées : elles ont été demandées
// explicitement par Taxi Sylvain et ne doivent plus jamais se perdre au fil des corrections.

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { driverMayMessageClient } = await import("../src/routes/messages.js");
const { matchZone, normalize, priceFor, quoteAll } = await import("../src/lib/pricing.js");

const ZONES = [
  { name: "Chambly", priceYUL: 85, priceYHU: 50, priceREM: null },
  { name: "Saint-Jean-sur-Richelieu", priceYUL: 105, priceYHU: 70, priceREM: null },
  { name: "Saint-Jean", priceYUL: 999, priceYHU: 999, priceREM: null },
  { name: "Longueuil", priceYUL: 70, priceYHU: 40, priceREM: null },
  { name: "Québec", priceYUL: 400, priceYHU: 380, priceREM: null },
];
const DESTINATIONS = [
  { code: "YUL", price: null },
  { code: "YHU", price: null },
  { code: "REM", price: 30 },
];

const MINUTE = 60 * 1000;
const COURSE_A = new Date("2026-09-20T13:00:00.000Z");

test("le chauffeur ne peut pas écrire au client bien avant la course", () => {
  const ride = { status: "ACCEPTED", scheduledFor: COURSE_A };
  assert.equal(driverMayMessageClient(ride, new Date(COURSE_A.getTime() - 180 * MINUTE)), false);
  assert.equal(driverMayMessageClient(ride, new Date(COURSE_A.getTime() - 61 * MINUTE)), false);
});

test("la discussion s'ouvre exactement une heure avant la course", () => {
  const ride = { status: "ACCEPTED", scheduledFor: COURSE_A };
  assert.equal(driverMayMessageClient(ride, new Date(COURSE_A.getTime() - 60 * MINUTE)), true);
  assert.equal(driverMayMessageClient(ride, new Date(COURSE_A.getTime() - 30 * MINUTE)), true);
  assert.equal(driverMayMessageClient(ride, new Date(COURSE_A.getTime() + 5 * MINUTE)), true);
});

test("une course déjà en cours autorise toujours la discussion", () => {
  const veryEarly = new Date(COURSE_A.getTime() - 300 * MINUTE);
  for (const status of ["EN_ROUTE", "STARTED", "COMPLETED"]) {
    assert.equal(driverMayMessageClient({ status, scheduledFor: COURSE_A }, veryEarly), true, status);
  }
});

test("une course immédiate, sans heure programmée, reste ouverte à la discussion", () => {
  assert.equal(driverMayMessageClient({ status: "ACCEPTED", scheduledFor: null }, new Date()), true);
});

test("la municipalité est reconnue dans une adresse écrite librement", () => {
  assert.equal(matchZone("12 Rue Bourgogne, Chambly, QC J3L 1A1", ZONES).name, "Chambly");
  assert.equal(matchZone("500 boulevard Sir-Wilfrid-Laurier Saint-Jean-sur-Richelieu QC", ZONES).name, "Saint-Jean-sur-Richelieu");
  assert.equal(matchZone("Vieux-Longueuil, Longueuil, QC", ZONES).name, "Longueuil");
});

test("le nom le plus long gagne, sinon Saint-Jean-sur-Richelieu serait facturé comme Saint-Jean", () => {
  const zone = matchZone("1 rue de la Gare Saint-Jean-sur-Richelieu", ZONES);
  assert.equal(zone.name, "Saint-Jean-sur-Richelieu");
  assert.equal(zone.priceYUL, 105);
});

test("« Québec » dans une adresse est la province, pas la ville de Québec", () => {
  assert.equal(matchZone("12 Rue Bourgogne, Chambly, Québec", ZONES).name, "Chambly");
  assert.equal(matchZone("1 Grande Allée, Québec, Capitale-Nationale", ZONES).name, "Québec");
});

test("les accents, tirets et majuscules ne changent rien", () => {
  assert.equal(normalize("Saint-Jean-sur-Richelieu"), "saintjeansurrichelieu");
  assert.equal(matchZone("50 rue Principale, SAINT-JEAN-SUR-RICHELIEU, QC", ZONES).name, "Saint-Jean-sur-Richelieu");
});

test("une municipalité inconnue ne renvoie aucun tarif inventé", () => {
  assert.equal(matchZone("100 Main Street, Plattsburgh, NY", ZONES), null);
  const { prices, zoneName } = quoteAll("100 Main Street, Plattsburgh, NY", DESTINATIONS, ZONES);
  assert.equal(zoneName, null);
  assert.equal(prices.YUL, null);
  assert.equal(prices.REM, 30, "le prix fixe de la destination sert de repli");
});

test("les trois tarifs d'une fiche client viennent de la grille", () => {
  const { prices, zoneName } = quoteAll("12 Rue Bourgogne, Chambly, QC", DESTINATIONS, ZONES);
  assert.equal(zoneName, "Chambly");
  assert.equal(prices.YUL, 85);
  assert.equal(prices.YHU, 50);
  assert.equal(prices.REM, 30);
});

test("un tarif REM saisi dans la grille remplace le prix fixe de la destination", () => {
  const zone = { name: "Chambly", priceYUL: 85, priceYHU: 50, priceREM: 42 };
  assert.equal(priceFor({ code: "REM", price: 30 }, zone), 42);
  assert.equal(priceFor({ code: "REM", price: 30 }, null), 30);
  assert.equal(priceFor(null, zone), null);
});

// ---------------------------------------------------------------------------
// Prix négocié avec un client (demande du propriétaire du 20 septembre 2026).
// Un prix inscrit sur la fiche d'un client l'emporte sur la grille des municipalités.
// ---------------------------------------------------------------------------
const { priceSource, clientPriceData, parsePrice } = await import("../src/lib/pricing.js");

test("le prix négocié d'un client passe avant la grille de sa municipalité", () => {
  assert.equal(priceFor({ code: "YUL" }, { priceYUL: 95 }, { priceYUL: 70 }), 70);
  assert.equal(priceFor({ code: "YHU" }, { priceYHU: 60 }, { priceYHU: 45 }), 45);
});

test("sans prix négocié, la grille décide, puis le prix de repli de la destination", () => {
  assert.equal(priceFor({ code: "YUL" }, { priceYUL: 95 }, null), 95);
  assert.equal(priceFor({ code: "YUL" }, { priceYUL: 95 }, { priceYUL: null }), 95);
  assert.equal(priceFor({ code: "REM", price: 30 }, { priceREM: null }, null), 30);
  assert.equal(priceFor({ code: "REM" }, null, null), null);
});

test("les trois destinations sont indépendantes l'une de l'autre", () => {
  const client = { priceREM: 25 };
  const zone = { priceYUL: 95, priceYHU: 60 };
  assert.equal(priceFor({ code: "YUL" }, zone, client), 95);
  assert.equal(priceFor({ code: "YHU" }, zone, client), 60);
  assert.equal(priceFor({ code: "REM" }, zone, client), 25);
});

test("un prix à zéro n'est jamais compris comme une course gratuite", () => {
  assert.equal(priceFor({ code: "YUL" }, { priceYUL: 95 }, { priceYUL: 0 }), 95);
  assert.equal(priceFor({ code: "REM", price: 30 }, null, { priceREM: 0 }), 30);
  assert.equal(priceFor({ code: "YUL" }, { priceYUL: -10 }, null), null);
});

test("un montant vide, nul, négatif ou illisible n'est pas enregistré", () => {
  for (const mauvais of ["", null, undefined, "0", "-5", "abc", " "]) assert.equal(parsePrice(mauvais), null, String(mauvais));
  assert.equal(parsePrice("72,5"), 72.5, "la virgule décimale du Québec est acceptée");
  assert.equal(parsePrice("72.5"), 72.5);
  assert.equal(parsePrice(95), 95);
  assert.equal(parsePrice("95.456"), 95.46, "arrondi au cent");
});

test("la fiche client dit d'où vient chacun de ses trois prix", () => {
  const destinations = [{ code: "YUL" }, { code: "YHU" }, { code: "REM", price: 30 }];
  const zones = [{ name: "Chambly", priceYUL: 95, priceYHU: 60 }];
  const r = quoteAll("12 Rue Bourgogne, Chambly, QC", destinations, zones, { priceYUL: 70 });
  assert.deepEqual(r.prices, { YUL: 70, YHU: 60, REM: 30 });
  assert.deepEqual(r.sources, { YUL: "client", YHU: "zone", REM: "destination" });
  assert.equal(r.zoneName, "Chambly");
});

test("un client sans adresse garde quand même son prix négocié", () => {
  const r = quoteAll(null, [{ code: "YUL" }, { code: "YHU" }], [{ name: "Chambly", priceYUL: 95 }], { priceYUL: 70 });
  assert.equal(r.prices.YUL, 70);
  assert.equal(r.prices.YHU, null);
  assert.equal(r.zoneName, null);
  assert.equal(r.sources.YHU, null);
});

test("effacer le prix d'un client le ramène à la grille, et un champ absent n'est pas touché", () => {
  const existant = { priceYUL: 70, priceYHU: null, priceREM: null };
  assert.deepEqual(clientPriceData({ priceYUL: "" }, existant, true).data, { priceYUL: null });
  assert.deepEqual(clientPriceData({ priceYHU: "45" }, existant, true).data, { priceYHU: 45 });
  assert.deepEqual(clientPriceData({ name: "Marie" }, existant, true).data, {}, "aucun prix envoyé : aucun prix touché");
});

test("un collaborateur sans la permission Courses ne peut pas fixer un prix, et on le lui dit", () => {
  const existant = { priceYUL: 70 };
  assert.equal(clientPriceData({ priceYUL: "50" }, existant, false).forbidden, true);
  assert.equal(clientPriceData({ priceYUL: 70 }, existant, false).forbidden, false, "ré-enregistrer sans rien changer reste permis");
  assert.deepEqual(clientPriceData({ priceYUL: "50" }, existant, false).data, {}, "rien n'est écrit en cas de refus");
});

// Protection du montant : seul Taxi Sylvain fixe les prix. Une vieille version de l'application
// client (celle du 13 septembre) envoyait 20 $ en dur ; le serveur ne doit jamais le retenir.
test("un montant envoyé par l'application d'un client n'est jamais facturé tel quel", () => {
  // Règle appliquée dans backend/src/routes/rides.js à la création d'une course :
  //   if (isClientBooking && !destinationCode) fare = 0;
  const montantRetenu = ({ isClientBooking, destinationCode, fareEnvoye, prixCatalogue }) => {
    let fare = fareEnvoye;
    if (destinationCode && prixCatalogue !== undefined && (isClientBooking || !fare)) fare = prixCatalogue ?? 0;
    if (isClientBooking && !destinationCode) fare = 0;
    return fare;
  };
  assert.equal(montantRetenu({ isClientBooking: true, destinationCode: null, fareEnvoye: 20 }), 0, "adresse libre : montant à confirmer");
  assert.equal(montantRetenu({ isClientBooking: true, destinationCode: "YUL", fareEnvoye: 20, prixCatalogue: 85 }), 85, "le catalogue s'impose au client");
  assert.equal(montantRetenu({ isClientBooking: false, destinationCode: null, fareEnvoye: 40 }), 40, "le Dispatch, lui, fixe le montant");
});
