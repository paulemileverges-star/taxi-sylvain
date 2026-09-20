// Recherche d'un client dans la console Dispatch (demande du propriétaire du 20 septembre 2026).
// Le module vit dans la console mais ne contient que du JavaScript pur.
import { test } from "node:test";
import assert from "node:assert/strict";

const { matchedFields, filterClients, normalizeText } = await import("../../apps/dispatch-web/src/lib/clientSearch.js");

// Fiches représentatives de la vraie base : un client complet, un client créé par téléphone sans
// courriel ni adresse, et un client dont seule l'adresse contient le mot cherché.
const TREMBLAY = { id: "1", name: "Jean-Étienne Tremblay", phone: "+15145551234", email: "jean.tremblay@exemple.ca", address: "12 Rue Bourgogne, Chambly, QC J3L 1Y8" };
const OBRIEN = { id: "2", name: "Marie O'Brien", phone: "+14508889999", email: null, address: null };
const COTE = { id: "3", name: "Étienne Côté", phone: "+14507770000", email: null, address: "Boul. Sir-Wilfrid-Laurier, Saint-Jean-sur-Richelieu, QC" };
const TOUS = [TREMBLAY, OBRIEN, COTE];
const ids = (r) => r.map((c) => c.id);

test("une recherche vide affiche tous les clients", () => {
  for (const q of ["", "   ", null, undefined]) assert.deepEqual(ids(filterClients(TOUS, q)), ["1", "2", "3"]);
});

test("on retrouve un client par son nom, sans se soucier des majuscules ni des accents", () => {
  assert.deepEqual(ids(filterClients(TOUS, "jean")), ["1", "3"]);
  assert.deepEqual(ids(filterClients(TOUS, "JEAN")), ["1", "3"]);
  assert.deepEqual(ids(filterClients(TOUS, "etienne")), ["1", "3"]);
  assert.deepEqual(ids(filterClients(TOUS, "étienne")), ["1", "3"]);
});

test("on retrouve un client par son téléphone, quelle que soit la façon de l'écrire", () => {
  for (const q of ["555-1234", "5145551234", "(514) 555"]) assert.deepEqual(ids(filterClients(TOUS, q)), ["1"], q);
});

test("on retrouve un client par son courriel", () => {
  assert.deepEqual(ids(filterClients(TOUS, "tremblay@")), ["1"]);
});

test("on retrouve un client par son adresse, sa ville ou son code postal", () => {
  for (const q of ["bourgogne", "chambly", "j3l", "j3l 1y8"]) assert.deepEqual(ids(filterClients(TOUS, q)), ["1"], q);
});

test("plusieurs mots se cherchent dans n'importe quel ordre, chez le même client", () => {
  assert.deepEqual(ids(filterClients(TOUS, "tremblay jean")), ["1"]);
  assert.deepEqual(ids(filterClients(TOUS, "chambly jean")), ["1"]);
  assert.deepEqual(ids(filterClients(TOUS, "tremblay boisbriand")), []);
});

test("un client créé par téléphone, sans courriel ni adresse, reste trouvable", () => {
  assert.deepEqual(ids(filterClients(TOUS, "marie")), ["2"]);
  assert.deepEqual(ids(filterClients(TOUS, "obrien")), ["2"]);
  assert.deepEqual(ids(filterClients(TOUS, "o'brien")), ["2"]);
  assert.deepEqual(ids(filterClients(TOUS, "450")), ["2", "3"]);
});

test("un texte qui ne correspond à personne ne ramène pas toute la liste", () => {
  assert.deepEqual(ids(filterClients(TOUS, "zzzzz")), []);
});

test("une saisie faite uniquement de ponctuation revient à ne pas chercher", () => {
  for (const q of ["-", "@", "()", "  .  "]) assert.equal(filterClients(TOUS, q).length, 3, q);
});

test("la fiche dit par quel champ elle a été trouvée", () => {
  assert.ok(matchedFields(TREMBLAY, "jean").includes("nom"));
  assert.deepEqual(matchedFields(COTE, "jean"), ["adresse"], "trouvé par son adresse, pas par son nom");
  assert.deepEqual(matchedFields(TREMBLAY, "chambly"), ["adresse"]);
  assert.deepEqual(matchedFields(TREMBLAY, "555-1234"), ["téléphone"]);
  assert.equal(matchedFields(OBRIEN, "zzz"), null, "null veut dire : ce client est écarté");
  assert.deepEqual(matchedFields(OBRIEN, ""), [], "recherche vide : personne n'est écarté");
});

test("le nettoyage du texte est le même que celui des tarifs", () => {
  assert.equal(normalizeText("Saint-Jean-sur-Richelieu"), "saintjeansurrichelieu");
  assert.equal(normalizeText("Côté, Étienne"), "coteetienne");
  assert.equal(normalizeText(null), "");
  assert.equal(normalizeText(undefined), "");
});
