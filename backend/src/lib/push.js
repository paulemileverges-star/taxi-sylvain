import { prisma } from "./prisma.js";
import { envoyerWebPush } from "./webPush.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Notifications "push" (Expo) — atteignent le chauffeur ou le client même quand l'app est
// fermée ou l'écran verrouillé, contrairement aux sons/évènements Socket.io qui ne marchent
// que si l'app est ouverte au premier plan. "Best effort" : une panne du service de push
// ne doit jamais faire échouer l'action qui déclenche la notification.
//
// Les versions web des applications ne peuvent pas recevoir de notification Expo : elles
// passent par Web Push (voir webPush.js). Chaque envoi part donc par les deux voies.
async function sendExpoPush(messages) {
  if (messages.length === 0) return;
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
      // Sans délai maximal, un appel suspendu bloquait toute la boucle des rappels, relancée
      // chaque minute : les rappels suivants ne partaient plus du tout.
      signal: AbortSignal.timeout(10000),
    });
    // Expo répond « ok » même quand chaque message échoue : c'est dans le détail que se lit
    // l'absence de clé Firebase, qui empêche toute notification d'arriver sur Android.
    const reponse = await res.json().catch(() => null);
    const items = Array.isArray(reponse?.data) ? reponse.data : [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item?.status !== "error") continue;
      console.error("Notification refusée :", item.message, item.details?.error || "");
      // L'appareil a désinstallé l'app ou révoqué le jeton : on l'oublie pour ne plus le
      // solliciter (sinon Expo finit par bloquer les envois du compte).
      if (item.details?.error === "DeviceNotRegistered" && messages[i]?.to) {
        await prisma.user.updateMany({ where: { pushToken: messages[i].to }, data: { pushToken: null } }).catch(() => null);
      }
    }
  } catch (err) {
    console.error("Erreur d'envoi de notification push:", err.message);
  }
}

function toMessage(pushToken, { title, body, data, channelId }) {
  const message = { to: pushToken, title, body, data: data || {}, sound: "default", priority: "high" };
  // Canal Android : « urgence » (nouvelle course, rappel urgent) sonne même en mode silencieux.
  if (channelId) message.channelId = channelId;
  return message;
}

/** Envoie à ces comptes par toutes les voies : Expo Push (app installée) et Web Push (navigateur). */
async function toutesLesVoies(userIds, payload) {
  const ids = userIds.filter(Boolean);
  if (ids.length === 0) return;
  const users = await prisma.user.findMany({
    where: { id: { in: ids }, pushToken: { not: null } },
    select: { pushToken: true },
  });
  await Promise.all([
    sendExpoPush(users.map((u) => toMessage(u.pushToken, payload))),
    envoyerWebPush(ids, payload).catch((err) => console.error("Erreur Web Push :", err?.message || err)),
  ]);
}

export async function notifyUser(userId, payload) {
  if (!userId) return;
  await toutesLesVoies([userId], payload);
}

export async function notifyUsers(userIds, payload) {
  await toutesLesVoies(userIds || [], payload);
}

export async function notifyAllDrivers(payload) {
  const drivers = await prisma.user.findMany({ where: { role: "DRIVER" }, select: { id: true } });
  await toutesLesVoies(drivers.map((d) => d.id), { channelId: "urgence", ...payload });
}
