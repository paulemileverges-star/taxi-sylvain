import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appDriver = JSON.parse(readFileSync(new URL("../../apps/driver-app/app.json", import.meta.url), "utf8"));
const appClient = JSON.parse(readFileSync(new URL("../../apps/client-app/app.json", import.meta.url), "utf8"));
const gitignore = readFileSync(new URL("../../.gitignore", import.meta.url), "utf8");

test("les apps Expo pointent bien vers les fichiers Firebase Android/iOS locaux sans les committer", () => {
  assert.equal(appDriver.expo.android.googleServicesFile, "./google-services.json");
  assert.equal(appDriver.expo.ios.googleServicesFile, "./GoogleService-Info.plist");
  assert.equal(appClient.expo.android.googleServicesFile, "./google-services.json");
  assert.equal(appClient.expo.ios.googleServicesFile, "./GoogleService-Info.plist");
  assert.match(gitignore, /google-services\.json/i);
  assert.match(gitignore, /GoogleService-Info\.plist/i);
});

// Les fichiers Firebase étant exclus du code enregistré, Expo ne les emporte pas sur ses serveurs de
// compilation : ils y arrivent par les variables de type fichier GOOGLE_SERVICES_JSON et
// GOOGLE_SERVICE_INFO_PLIST. Sans ce relais, une compilation produirait des applications sans
// notifications push, sans aucune erreur visible.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

for (const [nom, app] of [["chauffeur", "driver-app"], ["client", "client-app"]]) {
  test(`app ${nom} : sur les serveurs Expo, les fichiers Firebase viennent des variables d'environnement`, () => {
    const base = JSON.parse(readFileSync(new URL(`../../apps/${app}/app.json`, import.meta.url), "utf8")).expo;
    const configurer = require(`../../apps/${app}/app.config.js`);
    const avant = { json: process.env.GOOGLE_SERVICES_JSON, plist: process.env.GOOGLE_SERVICE_INFO_PLIST };
    try {
      delete process.env.GOOGLE_SERVICES_JSON;
      delete process.env.GOOGLE_SERVICE_INFO_PLIST;
      const local = configurer({ config: base });
      assert.equal(local.android.googleServicesFile, "./google-services.json");
      assert.equal(local.ios.googleServicesFile, "./GoogleService-Info.plist");
      assert.equal(local.android.package, base.android.package, "le reste de app.json doit être conservé");

      process.env.GOOGLE_SERVICES_JSON = "/eas/google-services.json";
      process.env.GOOGLE_SERVICE_INFO_PLIST = "/eas/GoogleService-Info.plist";
      const serveur = configurer({ config: base });
      assert.equal(serveur.android.googleServicesFile, "/eas/google-services.json");
      assert.equal(serveur.ios.googleServicesFile, "/eas/GoogleService-Info.plist");
    } finally {
      if (avant.json === undefined) delete process.env.GOOGLE_SERVICES_JSON; else process.env.GOOGLE_SERVICES_JSON = avant.json;
      if (avant.plist === undefined) delete process.env.GOOGLE_SERVICE_INFO_PLIST; else process.env.GOOGLE_SERVICE_INFO_PLIST = avant.plist;
    }
  });

  test(`app ${nom} : le profil de compilation lit bien les variables de l'environnement preview`, () => {
    const eas = JSON.parse(readFileSync(new URL(`../../apps/${app}/eas.json`, import.meta.url), "utf8"));
    assert.equal(eas.build.preview.environment, "preview");
  });
}
