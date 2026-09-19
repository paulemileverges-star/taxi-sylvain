// Envoi des photos de chauffeur : avant le 19 septembre 2026, un fichier .html pouvait être déposé
// et écrit hors du dossier des photos. Le nom du fichier est désormais fabriqué par le serveur.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
const { isSafeId, photoFileName } = await import("../src/routes/drivers.js");

test("un identifiant de compte normal est accepté", () => {
  assert.equal(isSafeId("cmfq3k2a0000abcd1234"), true);
});

test("un identifiant piégé est refusé", () => {
  for (const id of ["../etc", "..%2Fescaped", "abc/def", "abc.html", "", "a b", null, undefined, 123]) {
    assert.equal(isSafeId(id), false, `identifiant accepté à tort : ${id}`);
  }
});

test("seules les vraies images reçoivent un nom, avec une extension choisie par le serveur", () => {
  assert.equal(photoFileName("cmfq3k2a0000abcd1234", "photo", "image/jpeg", 1), "cmfq3k2a0000abcd1234-photo-1.jpg");
  assert.equal(photoFileName("cmfq3k2a0000abcd1234", "carPhoto", "image/png", 2), "cmfq3k2a0000abcd1234-carPhoto-2.png");
  assert.equal(photoFileName("cmfq3k2a0000abcd1234", "photo", "image/webp", 3), "cmfq3k2a0000abcd1234-photo-3.webp");
});

test("une page web, un script ou une image vectorielle déguisés sont refusés", () => {
  for (const type of ["text/html", "image/svg+xml", "application/javascript", "application/octet-stream", undefined]) {
    assert.equal(photoFileName("cmfq3k2a0000abcd1234", "photo", type), null, `type accepté à tort : ${type}`);
  }
});

test("un champ inconnu ou un identifiant piégé ne donne jamais de nom de fichier", () => {
  assert.equal(photoFileName("cmfq3k2a0000abcd1234", "autre", "image/jpeg"), null);
  assert.equal(photoFileName("..%2Fescaped", "photo", "image/jpeg"), null);
});
