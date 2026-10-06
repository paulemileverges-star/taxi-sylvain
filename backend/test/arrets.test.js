// Arrêts d'une course (demande du propriétaire du 6 octobre 2026, lib/arrets.js) : client, puis
// l'ami du client, puis l'aéroport.
import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
const { lireArrets, normaliserArrets, trajetCourt, arretsDe, MAX_ARRETS, ArretsInvalides } = await import("../src/lib/arrets.js");
const { computeDistanceKm } = await import("../src/lib/distance.js");

test("les arrêts gardent leur ordre ; les lignes vides sont ignorées", () => {
  const a = lireArrets([{ address: "  12 Rue A, Chambly, QC  " }, { address: "" }, "34 Rue B, Longueuil, QC"]);
  assert.deepEqual(a.map((x) => x.address), ["12 Rue A, Chambly, QC", "34 Rue B, Longueuil, QC"]);
  assert.deepEqual(lireArrets(undefined), []);
  assert.deepEqual(lireArrets(null), []);
});

test("au plus 5 arrêts, et une liste est exigée", () => {
  assert.throws(() => lireArrets(Array.from({ length: MAX_ARRETS + 1 }, (_, i) => `${i} Rue X, Chambly`)), ArretsInvalides);
  assert.throws(() => lireArrets("12 Rue A"), ArretsInvalides);
});

test("un arrêt choisi dans la liste garde son point ; un arrêt tapé est géocodé", async () => {
  const geocoder = async () => ({ lat: 45.5, lng: -73.4, forme: "34 Rue B, Longueuil, QC J4K 1A1", confidence: "porte", placeId: "GEO123456789" });
  const a = await normaliserArrets([
    { address: "12 Rue A, Chambly, QC", lat: 45.45, lng: -73.28, confidence: "porte", placeId: "PLACE12345678" },
    { address: "34 rue b longueuil" },
  ], { zones: [], geocoder });
  assert.equal(a[0].lat, 45.45);
  assert.equal(a[0].placeId, "PLACE12345678");
  assert.equal(a[1].address, "34 Rue B, Longueuil, QC J4K 1A1");
  assert.equal(a[1].lat, 45.5);
  assert.equal(a[1].confidence, "porte");
});

test("le trajet annoncé au chauffeur dit combien il y a d'arrêts", () => {
  const ride = { pickupAddress: "A", destAddress: "YUL", stops: [{ address: "B" }] };
  assert.equal(trajetCourt(ride), "A → YUL (+1 arrêt)");
  assert.equal(trajetCourt({ ...ride, stops: [{ address: "B" }, { address: "C" }] }), "A → YUL (+2 arrêts)");
  assert.equal(trajetCourt({ ...ride, stops: [] }), "A → YUL");
  assert.deepEqual(arretsDe({ stops: null }), []);
});

test("la distance passe par les arrêts (estimation à vol d'oiseau si le calcul d'itinéraire ne répond pas)", async () => {
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("hors ligne"); };
  try {
    const depart = { lat: 45.45, lng: -73.28 };
    const yul = { lat: 45.457445, lng: -73.750134 };
    const direct = await computeDistanceKm(depart, yul);
    const avecDetour = await computeDistanceKm(depart, yul, [{ lat: 45.53, lng: -73.52 }]);
    assert.ok(avecDetour > direct, `${avecDetour} > ${direct}`);
    assert.equal(await computeDistanceKm(depart, yul, [{ lat: null, lng: null }]), direct, "un arrêt sans point est sauté");
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});
