import { Linking, Platform } from "react-native";

// Ouvre Waze ou Google Maps vers une adresse — utilise les coordonnées GPS quand elles sont
// connues (plus fiable qu'une adresse texte), avec repli sur l'app native puis sur le lien web
// si l'app n'est pas installée. Sur Android, l'ouverture d'apps externes nécessite que le
// schéma/le lien soit déclaré dans <queries> (app.json) depuis Android 11 — voir app.json.
export async function openWaze({ address, lat, lng }) {
  const hasCoords = typeof lat === "number" && typeof lng === "number";
  const nativeUrl = hasCoords ? `waze://?ll=${lat},${lng}&navigate=yes` : `waze://?q=${encodeURIComponent(address)}&navigate=yes`;
  const webUrl = hasCoords
    ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
  return openWithFallback(nativeUrl, webUrl);
}

export async function openGoogleMaps({ address, lat, lng }) {
  const hasCoords = typeof lat === "number" && typeof lng === "number";
  const destination = hasCoords ? `${lat},${lng}` : encodeURIComponent(address);
  const nativeUrl = Platform.OS === "ios" ? `comgooglemaps://?daddr=${destination}&directionsmode=driving` : `google.navigation:q=${destination}`;
  const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
  return openWithFallback(nativeUrl, webUrl);
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
