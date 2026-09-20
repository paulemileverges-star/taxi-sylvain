// Notifications « Web Push » pour les versions web des trois applications (norme RFC 8030).
//
// Pourquoi : les notifications du navigateur utilisées jusqu'ici (« new Notification ») ne
// s'affichent que si l'onglet est ouvert, et Chrome sur Android les refuse carrément. Avec Web
// Push, le serveur pousse un message au navigateur via un « service worker » (sw.js), même onglet
// fermé, sur Android comme sur ordinateur. Sur iPhone, seule une application ajoutée à l'écran
// d'accueil peut les recevoir (limite d'Apple).
//
// Inactif tant que les clés VAPID ne sont pas renseignées (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY).
// Comme pour les notifications Expo : « best effort », une panne ne doit jamais faire échouer
// l'action qui déclenche la notification.
import webpush from "web-push";
import { prisma } from "./prisma.js";

let configure = false;

export function isWebPushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function webPushStatusLine() {
  return isWebPushConfigured()
    ? "Notifications web (Web Push) : actives."
    : "Notifications web (Web Push) : inactives (VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY manquantes).";
}

export function publicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

function preparer() {
  if (configure || !isWebPushConfigured()) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:reservations@taxisylvain.ca",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  configure = true;
}

/** Un abonnement envoyé par un navigateur est-il complet ? */
export function abonnementValide(sub) {
  return Boolean(
    sub && typeof sub.endpoint === "string" && /^https:\/\//.test(sub.endpoint) &&
    sub.keys && typeof sub.keys.p256dh === "string" && typeof sub.keys.auth === "string"
  );
}

export async function enregistrerAbonnement(userId, sub, userAgent) {
  // Un même navigateur peut passer d'un compte à l'autre : l'abonnement suit le compte connecté.
  await prisma.webPushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent || null },
    create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent || null },
  });
}

export async function retirerAbonnement(endpoint) {
  if (typeof endpoint !== "string" || !endpoint) return;
  await prisma.webPushSubscription.deleteMany({ where: { endpoint } });
}

/**
 * Envoie une notification à tous les navigateurs abonnés de ces comptes.
 * Un abonnement révoqué (404, 410) est effacé pour ne plus être tenté.
 */
export async function envoyerWebPush(userIds, { title, body, data, tag } = {}) {
  if (!isWebPushConfigured()) return { envoyes: 0 };
  const ids = (userIds || []).filter(Boolean);
  if (ids.length === 0) return { envoyes: 0 };
  preparer();

  const abonnements = await prisma.webPushSubscription.findMany({ where: { userId: { in: ids } } });
  const charge = JSON.stringify({ title: title || "Taxi Sylvain", body: body || "", data: data || {}, tag: tag || null });
  let envoyes = 0;
  await Promise.all(
    abonnements.map(async (a) => {
      try {
        await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, charge, { TTL: 60 * 60 });
        envoyes += 1;
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await prisma.webPushSubscription.deleteMany({ where: { id: a.id } }).catch(() => null);
        } else {
          console.error("Notification web non envoyée :", err?.statusCode || "", err?.message || err);
        }
      }
    })
  );
  return { envoyes };
}
