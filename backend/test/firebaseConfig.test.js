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
