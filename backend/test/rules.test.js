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
