// Notation à rattraper : courses terminées récemment que la personne n'a pas encore notées.
import { test } from "node:test";
import assert from "node:assert/strict";

const { coursesANoter, DELAI_NOTATION_JOURS } = await import("../src/lib/notation.js");

const NOW = new Date("2026-09-20T15:00:00Z");
const base = { status: "COMPLETED", clientId: "c1", driverId: "d1", pickupAddress: "A", destAddress: "B", client: { id: "c1", name: "Marie" }, driver: { id: "d1", name: "Jean" }, ratings: [] };
const ilYA = (jours) => new Date(NOW.getTime() - jours * 86400000);

test("le client voit son chauffeur à noter, le chauffeur voit son client, chacun une seule fois", () => {
  const rides = [{ ...base, id: "r1", completedAt: ilYA(1) }];
  const pourClient = coursesANoter(rides, "c1", NOW);
  assert.equal(pourClient.length, 1);
  assert.equal(pourClient[0].rideId, "r1");
  assert.equal(pourClient[0].autre.name, "Jean");
  const pourChauffeur = coursesANoter(rides, "d1", NOW);
  assert.equal(pourChauffeur[0].autre.name, "Marie");
  assert.equal(coursesANoter(rides, "autre", NOW).length, 0, "un tiers n'a rien à noter");
});

test("une course déjà notée par la personne ne revient plus, même si l'autre partie n'a pas noté", () => {
  const rides = [{ ...base, id: "r1", completedAt: ilYA(1), ratings: [{ fromUserId: "c1" }] }];
  assert.equal(coursesANoter(rides, "c1", NOW).length, 0);
  assert.equal(coursesANoter(rides, "d1", NOW).length, 1);
});

test("seules les courses terminées depuis moins de sept jours sont proposées, la plus récente d'abord", () => {
  assert.equal(DELAI_NOTATION_JOURS, 7);
  const rides = [
    { ...base, id: "vieille", completedAt: ilYA(8) },
    { ...base, id: "hier", completedAt: ilYA(1) },
    { ...base, id: "avant-hier", completedAt: ilYA(2) },
    { ...base, id: "en-cours", status: "STARTED", completedAt: null },
  ];
  assert.deepEqual(coursesANoter(rides, "c1", NOW).map((r) => r.rideId), ["hier", "avant-hier"]);
});

test("une réservation par téléphone sans compte client ne demande rien au chauffeur", () => {
  const rides = [{ ...base, id: "r1", clientId: null, client: null, completedAt: ilYA(1) }];
  assert.equal(coursesANoter(rides, "d1", NOW).length, 0);
});
