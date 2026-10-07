// Notifications Web Push (versions web) : inactives sans clés, et jamais bloquantes.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
delete process.env.VAPID_PUBLIC_KEY;
delete process.env.VAPID_PRIVATE_KEY;

const { isWebPushConfigured, webPushStatusLine, publicKey, abonnementValide, envoyerWebPush, destinationPushAutorisee } = await import("../src/lib/webPush.js");

// Clés de longueur réelle : p256dh = 65 octets en base64url (87 caractères), auth = 16 octets (22).
const CLES = { p256dh: "B".repeat(87), auth: "A".repeat(22) };

test("sans clés VAPID, le Web Push est inactif et le dit clairement", async () => {
  assert.equal(isWebPushConfigured(), false);
  assert.equal(publicKey(), null);
  assert.match(webPushStatusLine(), /inactives/);
  assert.deepEqual(await envoyerWebPush(["u1"], { title: "x", body: "y" }), { envoyes: 0, tentatives: 0 }, "aucun accès à la base, aucune erreur");
});

test("un abonnement de navigateur doit avoir un endpoint https et ses deux clés", () => {
  const bon = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: CLES };
  assert.equal(abonnementValide(bon), true);
  assert.equal(abonnementValide({ ...bon, endpoint: "http://exemple.ca" }), false);
  assert.equal(abonnementValide({ ...bon, keys: { p256dh: CLES.p256dh } }), false);
  assert.equal(abonnementValide({ ...bon, keys: { p256dh: "p", auth: "a" } }), false, "clés trop courtes");
  assert.equal(abonnementValide({ ...bon, keys: { ...CLES, auth: "<script>alert(1)</script>xx" } }), false, "caractères hors base64url");
  assert.equal(abonnementValide({ endpoint: "https://x" }), false);
  assert.equal(abonnementValide(null), false);
  assert.equal(abonnementValide("https://x"), false);
});

test("SEC-08 : seuls les services de notification des navigateurs sont contactés", () => {
  for (const ok of [
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
    "https://web.push.apple.com/QGuQyavXutnMH",
  ]) assert.equal(destinationPushAutorisee(ok), true, ok);
  for (const ko of [
    "https://127.0.0.1:9443/internal",
    "https://localhost/push",
    "https://10.0.0.5/push",
    "https://192.168.1.10/push",
    "https://[::1]/push",
    "https://169.254.169.254/latest/meta-data",
    "https://fcm.googleapis.com:8443/fcm/send/abc",
    "https://user:mdp@fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com.attaquant.example/x",
    "https://evilfcm.googleapis.com.example/x",
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://exemple.ca/push",
    "pas une adresse",
    "https://fcm.googleapis.com/" + "x".repeat(1100),
  ]) assert.equal(destinationPushAutorisee(ko), false, ko);
});
