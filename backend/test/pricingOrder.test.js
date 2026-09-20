// Page Tarifs : la grille est rangée par ordre alphabétique, quelle que soit la date d'ajout.
import { test } from "node:test";
import assert from "node:assert/strict";

const { trierZonesParNom } = await import("../src/lib/pricing.js");

test("une ville ajoutée après coup se range à sa place alphabétique, accents et majuscules ignorés", () => {
  const zones = [
    { name: "Varennes", sortOrder: 1 },
    { name: "Boucherville", sortOrder: 2 },
    { name: "éloi-Lac", sortOrder: 3 },
    { name: "Sainte-Julie", sortOrder: 4 },
    { name: "Saint-Jean-sur-Richelieu", sortOrder: 5 },
    { name: "chambly", sortOrder: 99 }, // ajoutée en dernier, minuscule
  ];
  assert.deepEqual(trierZonesParNom(zones).map((z) => z.name), ["Boucherville", "chambly", "éloi-Lac", "Saint-Jean-sur-Richelieu", "Sainte-Julie", "Varennes"]);
  assert.deepEqual(zones.map((z) => z.name)[0], "Varennes", "la liste d'origine n'est pas modifiée");
  assert.deepEqual(trierZonesParNom([]), []);
  assert.deepEqual(trierZonesParNom(undefined), []);
});
