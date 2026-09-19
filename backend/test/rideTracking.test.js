// La position d'un chauffeur n'est relayée vers le suivi d'une course que s'il en est toujours le
// chauffeur, pendant « En route » ou « Course démarrée ».
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeAssignmentCheck } from "../src/lib/rideTracking.js";

test("le chauffeur affecté, en route ou course démarrée : position relayée", async () => {
  for (const status of ["EN_ROUTE", "STARTED"]) {
    const check = makeAssignmentCheck(async () => ({ driverId: "d1", status }));
    assert.equal(await check("r1", "d1"), true, status);
  }
});

test("un chauffeur à qui la course a été retirée : position non relayée", async () => {
  const check = makeAssignmentCheck(async () => ({ driverId: "nouveau", status: "EN_ROUTE" }));
  assert.equal(await check("r1", "ancien"), false);
});

test("course terminée, annulée, supprimée ou pas encore commencée : rien n'est relayé", async () => {
  for (const ride of [{ driverId: "d1", status: "COMPLETED" }, { driverId: "d1", status: "CANCELLED" }, { driverId: "d1", status: "ACCEPTED" }, null]) {
    const check = makeAssignmentCheck(async () => ride);
    assert.equal(await check("r1", "d1"), false, JSON.stringify(ride));
  }
});

test("l'affectation est relue au plus tard après le délai de cache", async () => {
  let t = 0;
  let ride = { driverId: "ancien", status: "EN_ROUTE" };
  let lectures = 0;
  const check = makeAssignmentCheck(async () => { lectures += 1; return ride; }, { ttlMs: 15000, now: () => t });
  assert.equal(await check("r1", "ancien"), true);
  ride = { driverId: "nouveau", status: "EN_ROUTE" }; // le Dispatch réaffecte la course
  t = 5000;
  assert.equal(lectures, 1);
  await check("r1", "ancien");
  assert.equal(lectures, 1, "pas de nouvelle lecture avant 15 secondes");
  t = 16000;
  assert.equal(await check("r1", "ancien"), false, "après 15 secondes, l'ancien chauffeur n'est plus relayé");
  assert.equal(lectures, 2);
});

test("des données invalides ne sont jamais relayées", async () => {
  const check = makeAssignmentCheck(async () => ({ driverId: "d1", status: "EN_ROUTE" }));
  for (const [rideId, driverId] of [[null, "d1"], ["", "d1"], [123, "d1"], ["r1", undefined]]) {
    assert.equal(await check(rideId, driverId), false);
  }
});
