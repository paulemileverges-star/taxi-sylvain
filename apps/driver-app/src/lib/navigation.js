import { Linking, Platform } from "react-native";

// Ouvre Waze ou Google Maps vers l'adresse de la course — l'adresse TEXTE, telle qu'affichée au
// chauffeur, que Waze et Google Maps savent très bien retrouver. Les coordonnées enregistrées avec
// la course ne servent qu'au calcul de distance et à la carte : elles peuvent être approximatives
// (adresse tapée à la main, domicile du client géocodé automatiquement) et envoyaient parfois le
// chauffeur au mauvais endroit. Elles ne sont utilisées qu'en dernier recours, si l'adresse manque.
// Sur Android, l'ouverture d'apps externes nécessite que le schéma/le lien soit déclaré dans
// <queries> (app.json) depuis Android 11 — voir app.json.
function target({ address, lat, lng }) {
  const text = String(address || "").trim();
  if (text) return { kind: "text", value: text };
  if (typeof lat === "number" && typeof lng === "number") return { kind: "coords", value: `${lat},${lng}` };
  return null;
}

export async function openWaze(dest) {
  const t = target(dest);
  if (!t) return false;
  const query = t.kind === "text" ? `q=${encodeURIComponent(t.value)}` : `ll=${t.value}`;
  return openWithFallback(`waze://?${query}&navigate=yes`, `https://waze.com/ul?${query}&navigate=yes`);
}

export async function openGoogleMaps(dest) {
  const t = target(dest);
  if (!t) return false;
  const destination = t.kind === "text" ? encodeURIComponent(t.value) : t.value;
  const nativeUrl = Platform.OS === "ios" ? `comgooglemaps://?daddr=${destination}&directionsmode=driving` : `google.navigation:q=${destination}`;
  const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
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
