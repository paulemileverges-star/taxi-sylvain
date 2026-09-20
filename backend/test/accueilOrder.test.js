// Ordre de l'écran d'accueil des applications : à prendre, puis à faire par heure, puis l'historique.
import { test } from "node:test";
import assert from "node:assert/strict";

const { ordreAccueil } = await import("../src/lib/ridesOrder.js");

const c = (id, status, scheduledFor, createdAt = "2026-09-10T12:00:00Z") => ({ id, status, scheduledFor, createdAt });

test("les courses diffusées ou proposées passent devant, puis les courses à faire par heure de prise en charge", () => {
  const ordre = ordreAccueil([
    c("r1", "ACCEPTED", "2026-09-30T14:00:00Z"),
    c("r2", "EN_ROUTE", "2026-09-21T09:00:00Z"),
    c("r3", "BROADCAST", "2026-09-25T09:00:00Z"),
    c("r4", "ACCEPTED", "2026-09-22T09:00:00Z"),
    c("r5", "REQUESTED", "2026-09-21T20:00:00Z"),
  ]).map((r) => r.id);
  assert.deepEqual(ordre, ["r5", "r3", "r2", "r4", "r1"]);
});

test("l'historique vient en dernier, du plus récent au plus ancien", () => {
  const ordre = ordreAccueil([
    c("h1", "COMPLETED", "2026-09-01T09:00:00Z"),
    c("a1", "ACCEPTED", "2026-09-21T09:00:00Z"),
    c("h2", "CANCELLED", "2026-09-15T09:00:00Z"),
    c("h3", "COMPLETED", "2026-09-18T09:00:00Z"),
  ]).map((r) => r.id);
  assert.deepEqual(ordre, ["a1", "h3", "h2", "h1"]);
});

test("une course immédiate (sans heure) se classe à son heure de création ; la liste d'origine n'est pas modifiée", () => {
  const liste = [
    c("s1", "ACCEPTED", null, "2026-09-21T15:00:00Z"),
    c("s2", "ACCEPTED", "2026-09-21T14:00:00Z"),
  ];
  assert.deepEqual(ordreAccueil(liste).map((r) => r.id), ["s2", "s1"]);
  assert.deepEqual(liste.map((r) => r.id), ["s1", "s2"]);
  assert.deepEqual(ordreAccueil([]), []);
  assert.deepEqual(ordreAccueil(undefined), []);
});
