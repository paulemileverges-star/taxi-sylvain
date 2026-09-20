// Regroupement des courses par journée dans les deux applications. Le même fichier existe côté
// chauffeur et côté client : les deux écrans ne doivent jamais diverger.
import { test } from "node:test";
import assert from "node:assert/strict";

const chauffeur = await import("../../apps/driver-app/src/lib/rideDays.js");
const client = await import("../../apps/client-app/src/lib/rideDays.js");
const APPS = [["chauffeur", chauffeur.withDayHeaders], ["client", client.withDayHeaders]];

const course = (id, dayKey, dayLabel) => ({ id, dayKey, dayLabel });

for (const [nom, withDayHeaders] of APPS) {
  test(`${nom} : deux courses le même jour n'ont qu'un seul titre`, () => {
    const lignes = withDayHeaders([
      course("a", "2026-09-21", "lundi 21 septembre"),
      course("b", "2026-09-21", "lundi 21 septembre"),
    ]);
    assert.deepEqual(lignes.map((l) => l.type), ["day", "ride", "ride"]);
    assert.equal(lignes[0].label, "lundi 21 septembre");
  });

  test(`${nom} : un nouveau jour ouvre un nouveau titre, et aucune course n'est perdue`, () => {
    const rides = [
      course("a", "2026-09-21", "lundi 21 septembre"),
      course("b", "2026-09-22", "mardi 22 septembre"),
      course("c", "2026-09-22", "mardi 22 septembre"),
    ];
    const lignes = withDayHeaders(rides);
    assert.deepEqual(lignes.map((l) => l.type), ["day", "ride", "day", "ride", "ride"]);
    assert.deepEqual(lignes.filter((l) => l.type === "ride").map((l) => l.id), ["a", "b", "c"]);
  });

  test(`${nom} : l'ordre reçu du serveur est conservé tel quel`, () => {
    const rides = [course("z", "2026-09-21", "lundi 21 septembre"), course("a", "2026-09-21", "lundi 21 septembre")];
    assert.deepEqual(withDayHeaders(rides).filter((l) => l.type === "ride").map((l) => l.id), ["z", "a"]);
  });

  test(`${nom} : une liste vide ne produit aucun titre`, () => {
    assert.deepEqual(withDayHeaders([]), []);
    assert.deepEqual(withDayHeaders(null), []);
    assert.deepEqual(withDayHeaders(undefined), []);
  });

  test(`${nom} : une course sans journée reste affichée, sous un titre neutre`, () => {
    const lignes = withDayHeaders([{ id: "x" }]);
    assert.equal(lignes[0].type, "day");
    assert.equal(lignes[0].label, "Date inconnue");
    assert.equal(lignes[1].id, "x");
  });

  test(`${nom} : chaque ligne a une clé unique, titres compris`, () => {
    const lignes = withDayHeaders([
      course("a", "2026-09-21", "lundi 21 septembre"),
      course("b", "2026-09-22", "mardi 22 septembre"),
    ]);
    assert.equal(new Set(lignes.map((l) => l.id)).size, lignes.length);
  });
}

test("les deux applications découpent exactement de la même façon", () => {
  const rides = [
    course("a", "2026-09-21", "lundi 21 septembre"),
    course("b", "2026-09-21", "lundi 21 septembre"),
    course("c", "2026-09-22", "mardi 22 septembre"),
  ];
  assert.deepEqual(
    chauffeur.withDayHeaders(rides).map((l) => `${l.type}:${l.id}`),
    client.withDayHeaders(rides).map((l) => `${l.type}:${l.id}`)
  );
});

test("une journée coupée entre deux pages voit son titre réapparaître en haut de la suivante", () => {
  const page2 = chauffeur.withDayHeaders([course("suite", "2026-09-21", "lundi 21 septembre")]);
  assert.equal(page2[0].type, "day", "le lecteur doit savoir de quel jour il s'agit");
  assert.equal(page2[0].label, "lundi 21 septembre");
});
