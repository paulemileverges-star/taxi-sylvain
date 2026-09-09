import { prisma } from "./prisma.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Notifications "push" (Expo) — atteignent le chauffeur ou le client même quand l'app est
// fermée ou l'écran verrouillé, contrairement aux sons/évènements Socket.io qui ne marchent
// que si l'app est ouverte au premier plan. "Best effort" : une panne du service de push
// ne doit jamais faire échouer l'action qui déclenche la notification.
async function sendExpoPush(messages) {
  if (messages.length === 0) return;
  try {
    await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    console.error("Erreur d'envoi de notification push:", err.message);
  }
}

function toMessage(pushToken, { title, body, data }) {
  return { to: pushToken, title, body, data: data || {}, sound: "default", priority: "high" };
}

export async function notifyUser(userId, payload) {
  if (!userId) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { pushToken: true } });
  if (!user?.pushToken) return;
  await sendExpoPush([toMessage(user.pushToken, payload)]);
}

export async function notifyUsers(userIds, payload) {
  const ids = userIds.filter(Boolean);
  if (ids.length === 0) return;
  const users = await prisma.user.findMany({
    where: { id: { in: ids }, pushToken: { not: null } },
    select: { pushToken: true },
  });
  await sendExpoPush(users.map((u) => toMessage(u.pushToken, payload)));
}

export async function notifyAllDrivers(payload) {
  const drivers = await prisma.user.findMany({
    where: { role: "DRIVER", pushToken: { not: null } },
    select: { pushToken: true },
  });
  await sendExpoPush(drivers.map((u) => toMessage(u.pushToken, payload)));
}
