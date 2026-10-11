// Grille tarifaire définitive (12 octobre 2026) : complète, sans doublon, et chaque municipalité est bien
// reconnue dans une adresse écrite normalement. Une faute dans un nom (« Terbonne », « Notre Dame De Bon
// Conseil ») empêchait le prix de s'afficher sans que personne ne s'en aperçoive.

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { ZONES } = await import("../src/lib/seedPricing.js");
const { matchZone, normalize } = await import("../src/lib/pricing.js");

const zones = ZONES.map(([name, priceYUL, priceYHU, priceREM], i) => ({ id: String(i), name, priceYUL, priceYHU, priceREM, sortOrder: i + 1 }));

test("la grille compte 161 municipalités, toutes avec un prix vers YUL, YHU et REM", () => {
  assert.equal(zones.length, 161);
  for (const z of zones) {
    for (const cle of ["priceYUL", "priceYHU", "priceREM"]) {
      assert.ok(typeof z[cle] === "number" && z[cle] > 0, `${z.name} : ${cle} manquant`);
    }
  }
});

test("aucun doublon de municipalité, même aux accents et tirets près", () => {
  const vus = new Set();
  for (const z of zones) {
    const cle = normalize(z.name);
    assert.ok(!vus.has(cle), `doublon : ${z.name}`);
    vus.add(cle);
  }
});

test("chaque municipalité est reconnue dans une adresse écrite normalement", () => {
  for (const z of zones) {
    const trouvee = matchZone(`100 rue Principale, ${z.name}, QC`, zones);
    assert.ok(trouvee, `${z.name} non reconnue`);
  }
});

test("les noms corrigés le 12 octobre 2026 sont reconnus sous leur orthographe officielle", () => {
  for (const [adresse, attendu] of [
    ["1200 boulevard des Seigneurs, Terrebonne, QC", "Terrebonne"],
    ["10 rue Victor, Mirabel, QC", "Mirabel"],
    ["1000 chemin des Voyageurs, Mont-Tremblant, QC", "Mont-Tremblant"],
    ["45 rue Principale, Windsor, QC", "Windsor"],
    ["20 rue Adolphe-Chapleau, Bois-des-Filion, QC", "Bois-des-Filion"],
    ["500 rue Principale, Notre-Dame-du-Bon-Conseil, QC", "Notre-Dame-du-Bon-Conseil"],
    ["100 rue Principale, Saint-Zotique, QC", "Saint-Zotique"],
  ]) {
    assert.equal(matchZone(adresse, zones)?.name, attendu, adresse);
  }
});

test("les cinq prix estimés le 12 octobre 2026 sont ceux validés par le propriétaire", () => {
  const prix = Object.fromEntries(zones.map((z) => [z.name, [z.priceYUL, z.priceYHU, z.priceREM]]));
  assert.deepEqual(prix["Mansonville"], [255, 230, 215]);
  assert.deepEqual(prix["Saint-Colomban"], [120, 160, 145]);
  assert.deepEqual(prix["Sainte-Adèle"], [150, 190, 175]);
  assert.deepEqual(prix["Sainte-Brigide-d'Iberville"], [115, 90, 75]);
  assert.deepEqual(prix["Saint-Zotique"], [100, 160, 130]);
});
