// Surveillance des envois (audit du 7 octobre 2026, OPS-04) : un canal dont les derniers envois
// échouent tous est signalé en panne, sans message de test ; un refus propre à un destinataire
// (adresse invalide, application désinstallée) ne compte pas comme une panne du canal.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";

const { noterEnvoi, etatLivraisons, viderLivraisons, ECHECS_POUR_PANNE } = await import("../src/lib/livraisons.js");
const { sendMail, panneDuFournisseur } = await import("../src/lib/mailer.js");
const { sendExpoPush } = await import("../src/lib/push.js");

const realFetch = globalThis.fetch;
const KEYS = ["BREVO_API_KEY", "RESEND_API_KEY", "MAIL_FROM"];
const saved = {};

beforeEach(() => {
  viderLivraisons();
  for (const key of KEYS) saved[key] = process.env[key];
  process.env.BREVO_API_KEY = "cle-de-test";
  process.env.MAIL_FROM = "Taxi Sylvain <reservations@taxisylvain.ca>";
  delete process.env.RESEND_API_KEY;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function repondre(status, corps = {}) {
  globalThis.fetch = async () => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(corps), json: async () => corps });
}

test("un canal est en panne après plusieurs échecs de suite, et ne l'est plus dès qu'un envoi passe", () => {
  const t0 = Date.parse("2026-10-07T12:00:00Z");
  noterEnvoi("courriel", true, t0);
  for (let i = 1; i < ECHECS_POUR_PANNE; i += 1) noterEnvoi("courriel", false, t0 + i * 1000);
  assert.deepEqual(etatLivraisons(t0 + 10000).enPanne, [], "un échec isolé ne suffit pas");
  noterEnvoi("courriel", false, t0 + 20000);
  const etat = etatLivraisons(t0 + 30000);
  assert.deepEqual(etat.enPanne, ["courriel"]);
  assert.equal(etat.courriel.echecsDeSuite, ECHECS_POUR_PANNE);
  assert.equal(etat.courriel.envois, ECHECS_POUR_PANNE + 1);
  assert.ok(etat.courriel.dernierEchecLe);
  noterEnvoi("courriel", true, t0 + 40000);
  assert.deepEqual(etatLivraisons(t0 + 50000).enPanne, []);
});

test("seules les 24 dernières heures comptent, et l'état ne contient aucune donnée personnelle", () => {
  const t0 = Date.parse("2026-10-06T08:00:00Z");
  for (let i = 0; i < ECHECS_POUR_PANNE; i += 1) noterEnvoi("notification", false, t0 + i);
  assert.deepEqual(etatLivraisons(t0 + 1000).enPanne, ["notification"]);
  const lendemain = etatLivraisons(t0 + 25 * 60 * 60 * 1000);
  assert.deepEqual(lendemain.enPanne, []);
  assert.equal(lendemain.notification.envois, 0);
  assert.deepEqual(Object.keys(lendemain.courriel).sort(), ["dernierEchecLe", "echecs", "echecsDeSuite", "envois"]);
});

test("courriels : une clé refusée ou un fournisseur en erreur est une panne, une adresse invalide ne l'est pas", async () => {
  assert.equal(panneDuFournisseur({ ok: false, status: 401 }), true);
  assert.equal(panneDuFournisseur({ ok: false, status: 503 }), true);
  assert.equal(panneDuFournisseur({ ok: false, error: "délai dépassé" }), true, "fournisseur injoignable");
  assert.equal(panneDuFournisseur({ ok: false, status: 400 }), false);

  repondre(400, { message: "invalid email" });
  for (let i = 0; i < ECHECS_POUR_PANNE + 1; i += 1) await sendMail({ to: "faux", subject: "s", html: "h", text: "h" });
  assert.equal(etatLivraisons().courriel.envois, 0, "refus propre au destinataire : non compté");

  repondre(401, { message: "Key not found" });
  for (let i = 0; i < ECHECS_POUR_PANNE; i += 1) await sendMail({ to: "a@b.ca", subject: "s", html: "h", text: "h" });
  assert.deepEqual(etatLivraisons().enPanne, ["courriel"]);

  repondre(201, { messageId: "x" });
  await sendMail({ to: "a@b.ca", subject: "s", html: "h", text: "h" });
  assert.deepEqual(etatLivraisons().enPanne, []);
});

test("notifications de l'application : clé Firebase refusée = panne, téléphone isolé = non compté", async () => {
  const messages = [{ to: "ExponentPushToken[a]" }, { to: "ExponentPushToken[b]" }];
  repondre(200, { data: [{ status: "error", details: { error: "MessageTooBig" } }, { status: "error", details: { error: "MessageRateExceeded" } }] });
  await sendExpoPush(messages);
  assert.equal(etatLivraisons().notification.envois, 0);

  repondre(200, { data: [{ status: "error", details: { error: "InvalidCredentials" } }, { status: "error", details: { error: "InvalidCredentials" } }] });
  await sendExpoPush(messages);
  repondre(500, {});
  assert.deepEqual(await sendExpoPush(messages), { tentatives: 2, acceptes: 0 });
  assert.deepEqual(etatLivraisons().enPanne, ["notification"]);

  repondre(200, { data: [{ status: "ok" }, { status: "ok" }] });
  assert.deepEqual(await sendExpoPush(messages), { tentatives: 2, acceptes: 2 });
  assert.deepEqual(etatLivraisons().enPanne, []);
  assert.equal(etatLivraisons().notification.envois, 5);
});
