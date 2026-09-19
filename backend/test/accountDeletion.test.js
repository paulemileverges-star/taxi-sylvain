// Règles de suppression de compte (exigence Google Play). Chaque règle demandée par Taxi Sylvain
// a son test : elles protègent le compte Dispatch et les courses en cours, et ne doivent plus
// jamais se perdre au fil des corrections.
// Le module testé est pur : aucune base de données n'est nécessaire pour lancer ces tests.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  RIDE_STATUSES_BLOQUANTS,
  courseEnCours,
  courseEnCoursBloque,
  messageCourseEnCours,
  motifDeRefus,
} from "../src/lib/accountDeletion.js";

test("un client peut supprimer son compte", () => {
  assert.equal(motifDeRefus("CLIENT"), null);
});

// Décision du propriétaire du 19 septembre 2026 : suppression automatique, sans vérification.
test("un chauffeur peut supprimer son compte lui-même", () => {
  assert.equal(motifDeRefus("DRIVER"), null);
});

test("une course en cours bloque la suppression d'un client, jamais celle d'un chauffeur", () => {
  assert.equal(courseEnCoursBloque("CLIENT"), true);
  assert.equal(courseEnCoursBloque("DRIVER"), false);
});

test("le compte Dispatch ne peut jamais être supprimé, avec un message clair", () => {
  const motif = motifDeRefus("DISPATCH");
  assert.equal(typeof motif, "string");
  assert.match(motif, /Dispatch/);
  assert.match(motif, /ne peut pas être supprimé/);
});

test("un compte administrateur est renvoyé vers le Dispatch", () => {
  const motif = motifDeRefus("ADMIN");
  assert.equal(typeof motif, "string");
  assert.match(motif, /Dispatch/);
});

test("un rôle inconnu est refusé par défaut plutôt que supprimé", () => {
  assert.equal(typeof motifDeRefus("SUPERVISEUR"), "string");
  assert.equal(typeof motifDeRefus(undefined), "string");
});

test("une course acceptée, en route ou démarrée bloque la suppression", () => {
  for (const status of ["ACCEPTED", "EN_ROUTE", "STARTED"]) {
    const bloquante = courseEnCours([{ id: "course-1", status }]);
    assert.ok(bloquante, status);
    assert.equal(bloquante.id, "course-1");
  }
});

test("les trois statuts bloquants sont bien ceux d'une course commencée", () => {
  assert.deepEqual(RIDE_STATUSES_BLOQUANTS, ["ACCEPTED", "EN_ROUTE", "STARTED"]);
});

test("une course terminée, annulée, refusée ou seulement demandée ne bloque pas", () => {
  const rides = [
    { id: "a", status: "COMPLETED" },
    { id: "b", status: "CANCELLED" },
    { id: "c", status: "REFUSED" },
    { id: "d", status: "REQUESTED" },
    { id: "e", status: "BROADCAST" },
  ];
  assert.equal(courseEnCours(rides), null);
});

test("la première course bloquante est renvoyée, même noyée dans l'historique", () => {
  const rides = [
    { id: "a", status: "COMPLETED" },
    { id: "b", status: "EN_ROUTE" },
    { id: "c", status: "STARTED" },
  ];
  assert.equal(courseEnCours(rides).id, "b");
});

test("sans aucune course, rien ne bloque la suppression", () => {
  assert.equal(courseEnCours([]), null);
  assert.equal(courseEnCours(null), null);
  assert.equal(courseEnCours(undefined), null);
});

test("le message de course en cours dit aussi quoi faire", () => {
  const message = messageCourseEnCours();
  assert.match(message, /course en cours/);
  assert.match(message, /annuler/);
});
