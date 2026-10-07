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
import { noterEnvoi } from "./livraisons.js";

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

// Services de notification des navigateurs (Chrome et Android, Firefox, Edge, Safari). Le serveur
// envoie une requête à l'adresse de l'abonnement : sans cette liste, un compte pouvait faire appeler
// par le serveur n'importe quelle adresse, y compris interne (audit du 7 octobre 2026, SEC-08).
export const SERVICES_PUSH = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "notify.windows.com",
  "push.apple.com",
];

/** L'adresse d'un abonnement vise-t-elle un service de notification connu, en HTTPS standard ? */
export function destinationPushAutorisee(endpoint) {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  const hote = url.hostname.toLowerCase();
  return SERVICES_PUSH.some((s) => hote === s || hote.endsWith(`.${s}`));
}

// Clés d'un abonnement : texte base64url de longueur attendue (p256dh : clé publique de 65 octets,
// auth : 16 octets).
const base64url = (v, min, max) => typeof v === "string" && v.length >= min && v.length <= max && /^[A-Za-z0-9_-]+=*$/.test(v);

/** Un abonnement envoyé par un navigateur est-il complet et vise-t-il un vrai service ? */
export function abonnementValide(sub) {
  return Boolean(
    sub && destinationPushAutorisee(sub.endpoint) &&
    sub.keys && base64url(sub.keys.p256dh, 80, 100) && base64url(sub.keys.auth, 16, 32)
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

// Seul le compte propriétaire retire son abonnement (audit du 7 octobre 2026, SEC-09 : la suppression
// ne regardait que l'adresse, un autre compte pouvait couper les notifications d'autrui).
export async function retirerAbonnement(endpoint, userId) {
  if (typeof endpoint !== "string" || !endpoint || !userId) return;
  await prisma.webPushSubscription.deleteMany({ where: { endpoint, userId } });
}

/**
 * Envoie une notification à tous les navigateurs abonnés de ces comptes.
 * Un abonnement révoqué (404, 410) est effacé pour ne plus être tenté.
 */
export async function envoyerWebPush(userIds, { title, body, data, tag } = {}) {
  if (!isWebPushConfigured()) return { envoyes: 0, tentatives: 0 };
  const ids = (userIds || []).filter(Boolean);
  if (ids.length === 0) return { envoyes: 0, tentatives: 0 };
  preparer();

  const abonnements = (await prisma.webPushSubscription.findMany({ where: { userId: { in: ids } } }))
    // Un abonnement enregistré avant le contrôle des destinations n'est jamais contacté s'il ne vise
    // pas un service de notification connu.
    .filter((a) => destinationPushAutorisee(a.endpoint));
  const charge = JSON.stringify({ title: title || "Taxi Sylvain", body: body || "", data: data || {}, tag: tag || null });
  let envoyes = 0;
  await Promise.all(
    abonnements.map(async (a) => {
      try {
        await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, charge, { TTL: 60 * 60 });
        envoyes += 1;
        noterEnvoi("notificationWeb", true);
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          // Abonnement révoqué par le navigateur : rien à dire de l'état du canal.
          await prisma.webPushSubscription.deleteMany({ where: { id: a.id } }).catch(() => null);
        } else {
          noterEnvoi("notificationWeb", false);
          console.error("Notification web non envoyée :", err?.statusCode || "", err?.message || err);
        }
      }
    })
  );
  return { envoyes, tentatives: abonnements.length };
}
