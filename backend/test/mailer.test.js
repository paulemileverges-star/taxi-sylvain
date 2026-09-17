import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { isMailConfigured, mailProvider, mailStatusLine, parseFrom, sendMail } from "../src/lib/mailer.js";

const KEYS = ["BREVO_API_KEY", "RESEND_API_KEY", "MAIL_FROM"];
const saved = {};
const realFetch = globalThis.fetch;

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  globalThis.fetch = realFetch;
});

/** Remplace fetch pour capturer l'appel sans rien envoyer sur le réseau. */
function captureFetch(response = { ok: true, status: 200, text: async () => "" }) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return response;
  };
  return calls;
}

test("l'expéditeur se lit avec ou sans nom affiché", () => {
  assert.deepEqual(parseFrom("Taxi Sylvain <a@b.ca>"), { name: "Taxi Sylvain", email: "a@b.ca" });
  assert.deepEqual(parseFrom("a@b.ca"), { name: "Taxi Sylvain", email: "a@b.ca" });
  assert.equal(parseFrom(""), null);
});

test("sans clé ni expéditeur, rien n'est configuré et aucun envoi n'est tenté", async () => {
  assert.equal(mailProvider(), null);
  assert.equal(isMailConfigured(), false);
  const calls = captureFetch();
  const result = await sendMail({ to: "x@y.ca", subject: "s", html: "<p>h</p>", text: "h" });
  assert.equal(result.skipped, true);
  assert.equal(calls.length, 0);
});

test("une clé sans expéditeur ne suffit pas, et le démarrage le dit clairement", () => {
  process.env.BREVO_API_KEY = "cle";
  assert.equal(isMailConfigured(), false);
  assert.match(mailStatusLine(), /MAIL_FROM manquant/);
  process.env.MAIL_FROM = "Taxi Sylvain <a@b.ca>";
  assert.equal(isMailConfigured(), true);
  assert.match(mailStatusLine(), /brevo, expéditeur a@b\.ca/);
});

test("Brevo reçoit la clé en en-tête et l'invitation en pièce jointe lisible", async () => {
  process.env.BREVO_API_KEY = "cle-brevo";
  process.env.MAIL_FROM = "Taxi Sylvain <reservations@taxi-sylvain.ca>";
  const calls = captureFetch();

  const result = await sendMail({
    to: "chauffeur@example.com",
    toName: "Mamadou Diallo",
    subject: "Course confirmée",
    html: "<p>Bonjour</p>",
    text: "Bonjour",
    calendar: { filename: "course-taxi-sylvain.ics", content: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n", method: "REQUEST" },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(calls[0].options.headers["api-key"], "cle-brevo");
  assert.deepEqual(calls[0].body.sender, { name: "Taxi Sylvain", email: "reservations@taxi-sylvain.ca" });
  assert.deepEqual(calls[0].body.to, [{ email: "chauffeur@example.com", name: "Mamadou Diallo" }]);
  const attachment = calls[0].body.attachment[0];
  assert.equal(attachment.name, "course-taxi-sylvain.ics");
  assert.equal(Buffer.from(attachment.content, "base64").toString("utf8"), "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
});

test("Resend est utilisé quand c'est la seule clé, avec le bon type de pièce jointe", async () => {
  process.env.RESEND_API_KEY = "cle-resend";
  process.env.MAIL_FROM = "Taxi Sylvain <reservations@taxi-sylvain.ca>";
  const calls = captureFetch();

  await sendMail({
    to: "client@example.com",
    subject: "Course confirmée",
    html: "<p>Bonjour</p>",
    text: "Bonjour",
    calendar: { filename: "course.ics", content: "BEGIN:VCALENDAR", method: "CANCEL" },
  });

  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].options.headers.Authorization, "Bearer cle-resend");
  assert.equal(calls[0].body.from, "Taxi Sylvain <reservations@taxi-sylvain.ca>");
  assert.match(calls[0].body.attachments[0].content_type, /method=CANCEL/);
});

test("si les deux clés existent, Brevo est prioritaire", () => {
  process.env.BREVO_API_KEY = "b";
  process.env.RESEND_API_KEY = "r";
  assert.equal(mailProvider(), "brevo");
});

test("une panne du fournisseur ne lève jamais d'exception", async () => {
  process.env.RESEND_API_KEY = "cle";
  process.env.MAIL_FROM = "a@b.ca";
  globalThis.fetch = async () => {
    throw new Error("réseau coupé");
  };
  const result = await sendMail({ to: "x@y.ca", subject: "s", html: "h", text: "h" });
  assert.equal(result.ok, false);
  assert.match(result.error, /réseau coupé/);
});

test("un refus du fournisseur est rapporté sans casser l'appel", async () => {
  process.env.RESEND_API_KEY = "cle";
  process.env.MAIL_FROM = "a@b.ca";
  captureFetch({ ok: false, status: 422, text: async () => "domaine non vérifié" });
  const result = await sendMail({ to: "x@y.ca", subject: "s", html: "h", text: "h" });
  assert.equal(result.ok, false);
  assert.match(result.error, /422 domaine non vérifié/);
});

test("un destinataire sans courriel est ignoré proprement", async () => {
  process.env.RESEND_API_KEY = "cle";
  process.env.MAIL_FROM = "a@b.ca";
  const calls = captureFetch();
  const result = await sendMail({ to: null, subject: "s", html: "h", text: "h" });
  assert.equal(result.skipped, true);
  assert.equal(calls.length, 0);
});
