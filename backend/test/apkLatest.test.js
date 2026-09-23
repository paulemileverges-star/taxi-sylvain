import test from "node:test";
import assert from "node:assert/strict";
import { dernierApk, APPLICATIONS } from "../src/lib/apkLatest.js";

test("choisit la version la plus récente, en comparant les nombres et non les chaînes", () => {
  const fichiers = ["Taxi-Sylvain-Chauffeur-1.3.1.apk", "Taxi-Sylvain-Chauffeur-1.10.0.apk", "Taxi-Sylvain-Chauffeur-1.4.0.apk", "Taxi-Sylvain-Client-1.4.0.apk"];
  assert.equal(dernierApk(fichiers, "chauffeur"), "Taxi-Sylvain-Chauffeur-1.10.0.apk");
  assert.equal(dernierApk(fichiers, "client"), "Taxi-Sylvain-Client-1.4.0.apk");
});

test("ignore les fichiers mal nommés et renvoie null sans fichier", () => {
  assert.equal(dernierApk(["Taxi-Sylvain-Chauffeur-beta.apk", "autre.apk", "Taxi-Sylvain-Chauffeur-1.4.0.apk.part"], "chauffeur"), null);
  assert.equal(dernierApk([], "client"), null);
  assert.equal(dernierApk(["Taxi-Sylvain-Client-1.4.0.apk"], "dispatch"), null);
  assert.deepEqual(APPLICATIONS, ["chauffeur", "client"]);
});
