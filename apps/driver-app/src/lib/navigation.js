import { Linking, Platform } from "react-native";
import { chooseTarget, buildWazeUrl, buildGoogleMapsUrl } from "./navigationLinks";

// Ouvre Waze ou Google Maps vers l'adresse de la course. Les règles de choix (coordonnées ou
// texte) et la construction des liens vivent dans navigationLinks.js, testé côté serveur.
// Sur Android, l'ouverture d'applications externes exige la déclaration <queries> (app.json) ;
// sur iPhone, LSApplicationQueriesSchemes (app.json également).

export async function openWaze(dest) {
  const liens = buildWazeUrl(chooseTarget(dest));
  if (!liens) return false;
  return openWithFallback(liens.natif, liens.web);
}

export async function openGoogleMaps(dest) {
  const liens = buildGoogleMapsUrl(chooseTarget(dest), Platform.OS);
  if (!liens) return false;
  return openWithFallback(liens.natif, liens.web);
}

async function openWithFallback(nativeUrl, webUrl) {
  // react-native-web's Linking.canOpenURL() always resolves true regardless of the URL
  // (it can't actually probe app schemes from a browser), so on web we'd otherwise always
  // "succeed" at silently no-oping on an unopenable waze://... scheme. Go straight to the
  // https link there — the browser/OS handles app-vs-website resolution itself.
  if (Platform.OS === "web") {
    try {
      await Linking.openURL(webUrl);
      return true;
    } catch {
      return false;
    }
  }

  try {
    const canOpenNative = await Linking.canOpenURL(nativeUrl).catch(() => false);
    await Linking.openURL(canOpenNative ? nativeUrl : webUrl);
    return true;
  } catch {
    try {
      await Linking.openURL(webUrl);
      return true;
    } catch {
      return false;
    }
  }
}
