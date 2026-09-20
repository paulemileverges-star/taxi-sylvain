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

// Décision du propriétaire du 20 septembre 2026 : la suppression devient une DEMANDE, validée par
// le Dispatch. Le compte reste utilisable en attendant, la demande est annulable, réponse sous 30 jours.
const {
  DELAI_TRAITEMENT_JOURS, dateLimite, demandeEnAttente, messageDemandeEnvoyee, texteAlerteDispatch,
  courrielDemandeRecue, courrielDecision, courrielAlerteDispatch,
} = await import("../src/lib/accountDeletion.js");

test("la réponse est promise sous 30 jours, et la date limite le dit", () => {
  assert.equal(DELAI_TRAITEMENT_JOURS, 30);
  assert.equal(dateLimite(new Date("2026-09-20T20:00:00Z")).toISOString(), "2026-10-20T20:00:00.000Z");
  assert.match(messageDemandeEnvoyee(), /30 jours/);
  assert.match(messageDemandeEnvoyee(), /reste utilisable/);
});

test("une demande en attente se lit sur le compte", () => {
  assert.equal(demandeEnAttente({ deletionRequestedAt: new Date() }), true);
  assert.equal(demandeEnAttente({ deletionRequestedAt: null }), false);
  assert.equal(demandeEnAttente(null), false);
});

test("le Dispatch est alerté avec le nom, le rôle et l'origine de la demande", () => {
  const texte = texteAlerteDispatch({ name: "Jean Roy", role: "DRIVER", via: "web" });
  assert.match(texte, /Jean Roy/);
  assert.match(texte, /chauffeur/);
  assert.match(texte, /page web/);
  assert.match(texteAlerteDispatch({ name: "Marie", role: "CLIENT", via: "app" }), /client.*l'application/);
});

test("les courriels : accusé de réception avec la date limite, décision favorable, refus avec la raison", () => {
  const recu = courrielDemandeRecue({ nom: "Marie Tremblay", requestedAt: new Date("2026-09-20T20:00:00Z") });
  assert.match(recu.subject, /demande de suppression/);
  assert.match(recu.text, /Bonjour Marie,/);
  assert.match(recu.text, /20 octobre 2026/);
  assert.match(recu.text, /annulez la demande/);
  const oui = courrielDecision({ nom: "Marie Tremblay", approuvee: true });
  assert.match(oui.subject, /a été supprimé/);
  assert.match(oui.html, /Taxi Sylvain/);
  const non = courrielDecision({ nom: "Marie Tremblay", approuvee: false, raison: "une course est encore en cours" });
  assert.match(non.subject, /n'a pas été acceptée/);
  assert.match(non.text, /une course est encore en cours/);
  assert.match(non.text, /reste actif/);
  const alerte = courrielAlerteDispatch({ name: "Jean Roy", role: "DRIVER", via: "app", requestedAt: new Date("2026-09-20T20:00:00Z") });
  assert.match(alerte.subject, /Jean Roy/);
  assert.match(alerte.text, /avant le 20 octobre 2026/);
});
