// Correction complète d'une course par le Dispatch (demande du propriétaire du 20 septembre 2026).
import { test } from "node:test";
import assert from "node:assert/strict";

const { STATUTS_MODIFIABLES, changementDeStatut, montantValide, texteChangementDeStatut, libelleStatut } = await import("../src/lib/rideEdit.js");

const NOW = new Date("2026-09-20T22:00:00Z");

test("le Dispatch peut imposer tout statut sauf « refusée », qui n'appartient qu'à un chauffeur", () => {
  assert.deepEqual(STATUTS_MODIFIABLES, ["REQUESTED", "BROADCAST", "ACCEPTED", "EN_ROUTE", "STARTED", "COMPLETED", "CANCELLED"]);
  assert.equal(changementDeStatut({ status: "REFUSED", driverId: "d1" }).error, "Statut invalide.");
  assert.equal(changementDeStatut({ status: "N_IMPORTE", driverId: "d1" }).error, "Statut invalide.");
});

test("une course acceptée, en route ou démarrée exige un chauffeur", () => {
  for (const status of ["ACCEPTED", "EN_ROUTE", "STARTED"]) {
    assert.match(changementDeStatut({ status, driverId: null }).error, /chauffeur/);
    assert.equal(changementDeStatut({ status, driverId: "d1", now: NOW }).error, undefined);
  }
});

test("« en attente » et « diffusée » retirent le chauffeur", () => {
  assert.deepEqual(changementDeStatut({ status: "REQUESTED", driverId: "d1", now: NOW }).data, { status: "REQUESTED", driverId: null });
  assert.deepEqual(changementDeStatut({ status: "BROADCAST", driverId: "d1", now: NOW }).data, { status: "BROADCAST", driverId: null });
});

test("chaque étape reçoit son horodatage ; terminée date le récap, annulée date l'annulation", () => {
  assert.deepEqual(changementDeStatut({ status: "ACCEPTED", driverId: "d1", now: NOW }).data, { status: "ACCEPTED", acceptedAt: NOW });
  assert.deepEqual(changementDeStatut({ status: "EN_ROUTE", driverId: "d1", now: NOW }).data, { status: "EN_ROUTE", enRouteAt: NOW });
  assert.deepEqual(changementDeStatut({ status: "STARTED", driverId: "d1", now: NOW }).data, { status: "STARTED", startedAt: NOW });
  assert.deepEqual(changementDeStatut({ status: "COMPLETED", driverId: "d1", now: NOW }).data, { status: "COMPLETED", completedAt: NOW });
  assert.deepEqual(changementDeStatut({ status: "CANCELLED", driverId: null, now: NOW }).data, { status: "CANCELLED", cancelledAt: NOW });
});

test("un montant corrigé est un nombre positif ou nul, jamais un texte", () => {
  assert.equal(montantValide("95"), 95);
  assert.equal(montantValide(0), 0);
  assert.equal(montantValide("-3"), null);
  assert.equal(montantValide("abc"), null);
  assert.equal(montantValide(""), 0, "champ vide = montant à confirmer");
});

test("l'alerte de la console dit qui a changé quoi, en français", () => {
  const texte = texteChangementDeStatut({ auteur: "Sylvain", ride: { pickupAddress: "A", destAddress: "B" }, status: "COMPLETED" });
  assert.equal(texte, "Sylvain a passé la course A → B à « terminée ».");
  assert.equal(libelleStatut("BROADCAST"), "diffusée à tous");
});
