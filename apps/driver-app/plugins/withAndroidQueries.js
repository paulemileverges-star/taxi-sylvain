const { withAndroidManifest } = require("@expo/config-plugins");

// Depuis Android 11, une app doit déclarer <queries> dans le manifeste pour pouvoir détecter
// et lancer de façon fiable des apps externes (Waze, Google Maps) via Linking — sans ça,
// canOpenURL() peut renvoyer un faux négatif et l'app cible ne s'ouvre pas.
const PACKAGES = ["com.waze", "com.google.android.apps.maps"];

module.exports = function withAndroidQueries(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest.queries = manifest.queries || [{}];
    manifest.queries[0].package = PACKAGES.map((name) => ({ $: { "android:name": name } }));
    return config;
  });
};
