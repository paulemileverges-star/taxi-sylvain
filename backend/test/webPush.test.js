// Notifications Web Push (versions web) : inactives sans clés, et jamais bloquantes.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
delete process.env.VAPID_PUBLIC_KEY;
delete process.env.VAPID_PRIVATE_KEY;

const { isWebPushConfigured, webPushStatusLine, publicKey, abonnementValide, envoyerWebPush } = await import("../src/lib/webPush.js");

test("sans clés VAPID, le Web Push est inactif et le dit clairement", async () => {
  assert.equal(isWebPushConfigured(), false);
  assert.equal(publicKey(), null);
  assert.match(webPushStatusLine(), /inactives/);
  assert.deepEqual(await envoyerWebPush(["u1"], { title: "x", body: "y" }), { envoyes: 0 }, "aucun accès à la base, aucune erreur");
});

test("un abonnement de navigateur doit avoir un endpoint https et ses deux clés", () => {
  const bon = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "p", auth: "a" } };
  assert.equal(abonnementValide(bon), true);
  assert.equal(abonnementValide({ ...bon, endpoint: "http://exemple.ca" }), false);
  assert.equal(abonnementValide({ ...bon, keys: { p256dh: "p" } }), false);
  assert.equal(abonnementValide({ endpoint: "https://x" }), false);
  assert.equal(abonnementValide(null), false);
  assert.equal(abonnementValide("https://x"), false);
});
