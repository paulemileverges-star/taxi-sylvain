import { prisma } from "./prisma.js";
import { envoyerWebPush } from "./webPush.js";
import { noterEnvoi } from "./livraisons.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
// Refus d'Expo qui touchent TOUS les appareils (clé Firebase ou Apple absente ou fausse), par
// opposition à un téléphone qui a désinstallé l'application : seuls ceux-là signalent une panne du
// canal à la surveillance (audit du 7 octobre 2026, OPS-04).
const REFUS_DU_CANAL = ["InvalidCredentials", "MismatchSenderId"];

// Notifications "push" (Expo) — atteignent le chauffeur ou le client même quand l'app est
// fermée ou l'écran verrouillé, contrairement aux sons/évènements Socket.io qui ne marchent
// que si l'app est ouverte au premier plan. "Best effort" : une panne du service de push
// ne doit jamais faire échouer l'action qui déclenche la notification.
//
// Les versions web des applications ne peuvent pas recevoir de notification Expo : elles
// passent par Web Push (voir webPush.js). Chaque envoi part donc par les deux voies.
// Renvoie { tentatives, acceptes } : combien de messages Expo a acceptés (audit du 7 octobre 2026,
// B16 : sans ce compte, un rappel perdu dans une panne était tout de même noté « envoyé »).
export async function sendExpoPush(messages) {
  if (messages.length === 0) return { tentatives: 0, acceptes: 0 };
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
      // Sans délai maximal, un appel suspendu bloquait toute la boucle des rappels, relancée
      // chaque minute : les rappels suivants ne partaient plus du tout.
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      noterEnvoi("notification", false);
      console.error(`Service de notifications en erreur : code ${res.status}`);
      return { tentatives: messages.length, acceptes: 0 };
    }
    // Expo répond « ok » même quand chaque message échoue : c'est dans le détail que se lit
    // l'absence de clé Firebase, qui empêche toute notification d'arriver sur Android.
    const reponse = await res.json().catch(() => null);
    const items = Array.isArray(reponse?.data) ? reponse.data : [];
    let acceptes = 0;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item?.status === "ok") {
        acceptes += 1;
        noterEnvoi("notification", true);
      }
      if (item?.status !== "error") continue;
      if (REFUS_DU_CANAL.includes(item.details?.error)) noterEnvoi("notification", false);
      console.error("Notification refusée :", item.message, item.details?.error || "");
      // L'appareil a désinstallé l'app ou révoqué le jeton : on l'oublie pour ne plus le
      // solliciter (sinon Expo finit par bloquer les envois du compte).
      if (item.details?.error === "DeviceNotRegistered" && messages[i]?.to) {
        await prisma.user.updateMany({ where: { pushToken: messages[i].to }, data: { pushToken: null } }).catch(() => null);
      }
    }
    return { tentatives: messages.length, acceptes };
  } catch (err) {
    noterEnvoi("notification", false);
    console.error("Erreur d'envoi de notification push:", err.message);
    return { tentatives: messages.length, acceptes: 0 };
  }
}

function toMessage(pushToken, { title, body, data, channelId }) {
  const message = { to: pushToken, title, body, data: data || {}, sound: "default", priority: "high" };
  // Canal Android : « urgence » (nouvelle course, rappel urgent) sonne même en mode silencieux.
  if (channelId) message.channelId = channelId;
  return message;
}

/**
 * Envoie à ces comptes par toutes les voies : Expo Push (app installée) et Web Push (navigateur).
 * Renvoie { tentatives, envoyes, echec } : echec = au moins une voie à tenter, aucune n'a abouti
 * (panne passagère : l'envoi mérite d'être retenté). Sans aucune voie (pas d'appareil enregistré),
 * il n'y a rien à retenter.
 */
async function toutesLesVoies(userIds, payload) {
  const ids = userIds.filter(Boolean);
  if (ids.length === 0) return { tentatives: 0, envoyes: 0, echec: false };
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: ids }, pushToken: { not: null } },
      select: { pushToken: true },
    });
    const [expo, web] = await Promise.all([
      sendExpoPush(users.map((u) => toMessage(u.pushToken, payload))),
      envoyerWebPush(ids, payload).catch((err) => {
        console.error("Erreur Web Push :", err?.message || err);
        return { envoyes: 0, tentatives: 1 };
      }),
    ]);
    const tentatives = expo.tentatives + (web?.tentatives || 0);
    const envoyes = expo.acceptes + (web?.envoyes || 0);
    return { tentatives, envoyes, echec: tentatives > 0 && envoyes === 0 };
  } catch (err) {
    console.error("Notification non envoyée :", err?.message || err);
    return { tentatives: 1, envoyes: 0, echec: true };
  }
}

export async function notifyUser(userId, payload) {
  if (!userId) return { tentatives: 0, envoyes: 0, echec: false };
  return toutesLesVoies([userId], payload);
}

export async function notifyUsers(userIds, payload) {
  return toutesLesVoies(userIds || [], payload);
}

export async function notifyAllDrivers(payload) {
  const drivers = await prisma.user.findMany({ where: { role: "DRIVER" }, select: { id: true } });
  return toutesLesVoies(drivers.map((d) => d.id), { channelId: "urgence", ...payload });
}
