// Aéroport Montréal-Trudeau (demande du propriétaire du 6 octobre 2026) : seules deux adresses
// proposées, les Arrivées et le stationnement P4, au même tarif YUL.
import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
const { rechercheAeroportYul, YUL_ARRIVEES, YUL_P4, CODES_YUL } = await import("../src/lib/aeroportYul.js");
const { champPrix, priceFor, matchZone } = await import("../src/lib/pricing.js");

test("une recherche qui vise YUL ne propose que les deux adresses du catalogue", () => {
  for (const q of ["YUL", "yul arrivées", "aéroport", "Aeroport Montreal", "Trudeau", "975 Roméo-Vachon", "aéroport Dorval", "P4 Albert-De Niverville"]) {
    assert.equal(rechercheAeroportYul(q), true, q);
  }
});

test("les autres aéroports et les adresses ordinaires suivent la recherche normale", () => {
  for (const q of ["aéroport Saint-Hubert", "YHU", "aéroport de Québec", "Mirabel aéroport", "12 rue Bourgogne Chambly", "Dorval"]) {
    assert.equal(rechercheAeroportYul(q), false, q);
  }
});

test("les deux adresses YUL ont un point de guidage vérifié devant le terminal ou au P4", () => {
  assert.deepEqual(CODES_YUL, ["YUL", "YULP4"]);
  assert.match(YUL_ARRIVEES.address, /Arrivées/);
  assert.match(YUL_P4.address, /^590 Boulevard Albert-De Niverville/);
  assert.equal(YUL_ARRIVEES.pointVerified && YUL_P4.pointVerified, true);
  // Le point des Arrivées n'est plus le centre des pistes (45.4706, -73.7408).
  assert.ok(Math.abs(YUL_ARRIVEES.lat - 45.4706) > 0.01);
});

test("le P4 prend le tarif YUL de la grille, comme les Arrivées", () => {
  assert.equal(champPrix("YULP4"), "priceYUL");
  assert.equal(champPrix("YUL"), "priceYUL");
  assert.equal(champPrix("YHU"), "priceYHU");
  assert.equal(champPrix("XYZ"), null);
  const zone = { name: "Chambly", priceYUL: 85, priceYHU: 50 };
  assert.equal(priceFor({ code: "YULP4", price: null }, zone), 85);
  assert.equal(priceFor({ code: "YULP4", price: null }, zone, { priceYUL: 75 }), 75, "le prix négocié du client s'applique aussi au P4");
});

test("les adresses YUL font reconnaître Dorval dans la grille, jamais une autre ville", () => {
  const zones = [{ name: "Dorval" }, { name: "Montréal" }];
  assert.equal(matchZone(YUL_ARRIVEES.address, zones)?.name, "Dorval");
  assert.equal(matchZone(YUL_P4.address, zones)?.name, "Dorval");
});
