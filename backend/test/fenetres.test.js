// Délais avant une course (demandes du propriétaire du 6 octobre 2026, lib/fenetres.js) :
// contacter le client à partir de 2 heures avant, se mettre en route à partir de 3 heures avant.
import test from "node:test";
import assert from "node:assert/strict";
import { chauffeurPeutContacter, chauffeurPeutPartir, ouvertureDepart, quandLisible } from "../src/lib/fenetres.js";

const MINUTE = 60 * 1000;
const COURSE = new Date("2026-10-07T17:00:00.000Z"); // 13:00 au Québec
const ride = { status: "ACCEPTED", scheduledFor: COURSE };
const avant = (minutes) => new Date(COURSE.getTime() - minutes * MINUTE);

test("se mettre en route ou démarrer : refusé à 3 h 01 avant, permis à 3 h 00 exactement", () => {
  assert.equal(chauffeurPeutPartir(ride, avant(181)), false);
  assert.equal(chauffeurPeutPartir(ride, avant(180)), true);
  assert.equal(chauffeurPeutPartir(ride, avant(10)), true);
  assert.equal(chauffeurPeutPartir(ride, new Date(COURSE.getTime() + 30 * MINUTE)), true, "en retard : toujours permis");
});

test("contacter le client (message ou appel masqué) : refusé à 2 h 01 avant, permis à 2 h 00", () => {
  assert.equal(chauffeurPeutContacter(ride, avant(121)), false);
  assert.equal(chauffeurPeutContacter(ride, avant(120)), true);
});

test("une course en route ou en cours reste toujours joignable", () => {
  for (const status of ["EN_ROUTE", "STARTED", "COMPLETED"]) {
    assert.equal(chauffeurPeutContacter({ status, scheduledFor: COURSE }, avant(600)), true, status);
  }
});

test("une course immédiate, sans heure prévue, n'a aucun délai", () => {
  assert.equal(chauffeurPeutPartir({ status: "ACCEPTED", scheduledFor: null }, new Date()), true);
  assert.equal(chauffeurPeutContacter({ status: "ACCEPTED", scheduledFor: null }, new Date()), true);
});

test("l'heure annoncée au chauffeur est sur 24 heures, à l'heure du Québec", () => {
  assert.equal(ouvertureDepart(ride).toISOString(), "2026-10-07T14:00:00.000Z");
  assert.equal(quandLisible(ouvertureDepart(ride), new Date("2026-10-07T12:00:00Z")), "10:00");
  assert.equal(quandLisible(new Date("2026-10-07T17:21:00Z"), new Date("2026-10-06T12:00:00Z")), "2026-10-07 à 13:21");
});
