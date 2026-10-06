// Fiche chauffeur modifiable par le Dispatch (demande du propriétaire du 6 octobre 2026).
import test from "node:test";
import assert from "node:assert/strict";
import { donneesFicheChauffeur } from "../src/lib/ficheChauffeur.js";

test("changement de voiture : modèle, couleur et plaque, sans toucher au reste", () => {
  const { data, erreur } = donneesFicheChauffeur({ carModel: " Toyota  Camry 2024 ", carColor: "Gris", plate: "t45 klm" });
  assert.equal(erreur, undefined);
  assert.deepEqual(data, { carModel: "Toyota Camry 2024", carColor: "Gris", plate: "T45 KLM" });
});

test("nom, courriel et téléphone se modifient mais ne peuvent pas être vidés", () => {
  assert.deepEqual(donneesFicheChauffeur({ name: "Jean  Roy", email: " Jean@Exemple.CA ", phone: "514 555-1234" }).data, { name: "Jean Roy", email: "jean@exemple.ca", phone: "514 555-1234" });
  assert.match(donneesFicheChauffeur({ name: "  " }).erreur, /nom/i);
  assert.match(donneesFicheChauffeur({ email: "pas-un-courriel" }).erreur, /courriel/i);
  assert.match(donneesFicheChauffeur({ phone: "555-12" }).erreur, /téléphone/i);
});

test("véhicule, couleur et plaque peuvent être effacés", () => {
  assert.deepEqual(donneesFicheChauffeur({ carColor: "", plate: "  " }).data, { carColor: null, plate: null });
  assert.deepEqual(donneesFicheChauffeur({}).data, {});
});
