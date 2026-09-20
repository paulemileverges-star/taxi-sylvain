import { Platform } from "react-native";
import { api } from "./api";

// Version web : notifications du navigateur, par le « service worker » (public/sw.js).
//   - notifyWeb : notification locale quand un évènement arrive par Socket.io et que l'onglet
//     n'est pas au premier plan. Passe par le service worker : Chrome sur Android refuse
//     « new Notification » (c'est pour cela qu'aucune notification ne s'affichait sur les
//     téléphones Android avec la version web) ;
//   - registerWebPush : abonnement Web Push pour recevoir les notifications du serveur même onglet
//     fermé (Android Chrome, ordinateur ; sur iPhone seulement si l'app est ajoutée à l'écran d'accueil).
// Sans effet sur les applications installées : Expo Push prend le relais.

const estWeb = () => Platform.OS === "web" && typeof window !== "undefined" && typeof navigator !== "undefined";

let enregistrement = null;
async function serviceWorker() {
  if (!estWeb() || !("serviceWorker" in navigator)) return null;
  if (!enregistrement) {
    try {
      enregistrement = await navigator.serviceWorker.register("/sw.js");
    } catch (e) {
      console.warn("Service worker indisponible :", e.message);
      return null;
    }
  }
  return enregistrement;
}

// À appeler dans le geste de l'utilisateur (bouton Se connecter) : les navigateurs ignorent une
// demande de permission qui ne suit pas un clic.
export async function requestWebNotificationPermission() {
  if (!estWeb() || typeof Notification === "undefined") return;
  try {
    if (Notification.permission === "default") await Notification.requestPermission();
  } catch {
    // refusé ou non supporté
  }
  await serviceWorker();
}

export async function notifyWeb(title, body) {
  if (!estWeb() || typeof Notification === "undefined" || typeof document === "undefined") return;
  if (Notification.permission !== "granted" || document.visibilityState === "visible") return;
  try {
    const reg = await serviceWorker();
    if (reg) await reg.showNotification(title, { body, icon: "/icon.png", tag: `ts-${Date.now()}` });
    else new Notification(title, { body, tag: `ts-${Date.now()}` });
  } catch {
    // non supporté
  }
}

// La clé publique VAPID arrive en base64 « url » ; le navigateur la veut en octets.
function cleVapid(base64url) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** Abonne ce navigateur aux notifications du serveur pour le compte connecté. */
export async function registerWebPush() {
  if (!estWeb() || typeof Notification === "undefined" || Notification.permission !== "granted") return null;
  try {
    const reg = await serviceWorker();
    if (!reg || !reg.pushManager) return null;
    const { configured, publicKey } = await api.webPushKey();
    if (!configured || !publicKey) return null;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleVapid(publicKey) });
    await api.webPushSubscribe(sub.toJSON());
    return sub;
  } catch (e) {
    console.warn("Web Push indisponible :", e.message);
    return null;
  }
}

/** À la déconnexion : ce navigateur ne reçoit plus les notifications de ce compte. */
export async function unregisterWebPush() {
  if (!estWeb()) return;
  try {
    const reg = await serviceWorker();
    const sub = await reg?.pushManager?.getSubscription();
    if (sub) {
      await api.webPushUnsubscribe(sub.endpoint).catch(() => null);
      await sub.unsubscribe();
    }
  } catch {
    // rien à retirer
  }
}
