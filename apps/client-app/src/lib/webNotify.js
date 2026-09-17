import { Platform } from "react-native";

// Version web : notification système du navigateur quand l'onglet n'est pas au premier plan
// (l'équivalent « push » des APK, dans les limites du navigateur : il faut que l'onglet reste
// ouvert). Sans effet sur Android/iOS, où les vraies notifications push prennent le relais.
export function requestWebNotificationPermission() {
  if (Platform.OS !== "web" || typeof Notification === "undefined") return;
  if (Notification.permission === "default") Notification.requestPermission().catch(() => null);
}

export function notifyWeb(title, body) {
  if (Platform.OS !== "web" || typeof Notification === "undefined" || typeof document === "undefined") return;
  if (Notification.permission !== "granted" || document.visibilityState === "visible") return;
  try {
    new Notification(title, { body, tag: `ts-${Date.now()}` });
  } catch {
    // non supporté
  }
}
