import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

// Le module charge le client de base de données : une URL factice suffit, aucune requête n'est
// faite dans ces tests.
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";

const { buildRideEmail, deliver, formatWhen, rideFields } = await import("../src/lib/rideEmails.js");

const RIDE = {
  id: "ride123",
  scheduledFor: "2026-09-20T13:30:00.000Z",
  pickupAddress: "12 Rue Bourgogne, Chambly, QC",
  destAddress: "Aéroport Montréal-Trudeau (YUL)",
  distanceKm: 32.4,
  fare: 85,
  flightNumber: "AC 872",
  client: { id: "c1", name: "Paul-Emile Verges", email: "paul@example.com", phone: "+15145551234" },
  driver: { id: "d1", name: "Mamadou Diallo", email: "mamadou@example.com", carModel: "Toyota Sienna", plate: "ABC 123" },
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
});

test("l'heure est celle du Québec, pas celle du serveur", () => {
  // 13 h 30 UTC le 20 septembre = 9 h 30 à Montréal.
  assert.match(formatWhen(RIDE.scheduledFor), /9 h 30/);
  assert.match(formatWhen(RIDE.scheduledFor), /20 septembre 2026/);
  assert.equal(formatWhen(null), "dès que possible");
});

test("le chauffeur voit le nom du client, jamais son téléphone", () => {
  const { subject, html, text } = buildRideEmail({ ride: RIDE, audience: "driver" });
  assert.match(subject, /^Course confirmée · /);
  assert.match(subject, /Chambly/);
  assert.match(text, /Client : Paul-Emile Verges/);
  assert.ok(!html.includes("5145551234"), "le téléphone du client ne doit pas figurer dans le courriel");
  assert.ok(!text.includes("5145551234"));
});

test("le client voit son chauffeur, le véhicule et la plaque", () => {
  const { text } = buildRideEmail({ ride: RIDE, audience: "client" });
  assert.match(text, /Chauffeur : Mamadou Diallo · Toyota Sienna · ABC 123/);
});

test("un montant non fixé est annoncé comme tel plutôt qu'à zéro dollar", () => {
  const fields = rideFields({ ...RIDE, fare: 0 }, "driver");
  const montant = fields.find(([label]) => label === "Montant")[1];
  assert.equal(montant, "à confirmer par Taxi Sylvain");
});

test("le numéro de vol n'apparaît que s'il existe", () => {
  assert.ok(rideFields(RIDE, "driver").some(([label]) => label === "Numéro de vol"));
  assert.ok(!rideFields({ ...RIDE, flightNumber: null }, "driver").some(([label]) => label === "Numéro de vol"));
});

test("une annulation le dit dans l'objet et dans le texte", () => {
  const { subject, text } = buildRideEmail({ ride: RIDE, audience: "driver", cancelled: true });
  assert.match(subject, /^Course annulée · /);
  assert.match(text, /ne vous est plus affectée/);
});

test("un nom contenant du code est neutralisé dans le courriel", () => {
  const { html } = buildRideEmail({
    ride: { ...RIDE, client: { ...RIDE.client, name: "<script>alert(1)</script>" } },
    audience: "driver",
  });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("aucun courriel n'est envoyé à une adresse fictive de réservation téléphonique", async () => {
  process.env.RESEND_API_KEY = "cle";
  process.env.MAIL_FROM = "Taxi Sylvain <a@b.ca>";
  let called = 0;
  globalThis.fetch = async () => {
    called += 1;
    return { ok: true, status: 200, text: async () => "" };
  };

  const fictif = { name: "Client sur fiche", email: "client-a1b2c3@reservation.taxisylvain.local" };
  const result = await deliver({ ride: RIDE, person: fictif, audience: "client", cancelled: false, sequence: 1 });

  assert.equal(result.skipped, true);
  assert.equal(called, 0, "un courriel technique ne doit jamais recevoir d'envoi");
});

test("un vrai destinataire reçoit bien l'invitation, avec la bonne séquence", async () => {
  process.env.RESEND_API_KEY = "cle";
  process.env.MAIL_FROM = "Taxi Sylvain <reservations@taxi-sylvain.ca>";
  let body = null;
  globalThis.fetch = async (url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, status: 200, text: async () => "" };
  };

  const result = await deliver({ ride: RIDE, person: RIDE.driver, audience: "driver", cancelled: false, sequence: 4 });

  assert.equal(result.ok, true);
  assert.deepEqual(body.to, ["mamadou@example.com"]);
  const ics = Buffer.from(body.attachments[0].content, "base64").toString("utf8");
  assert.match(ics, /UID:course-ride123@taxi-sylvain/);
  assert.match(ics, /SEQUENCE:4/);
  assert.match(ics, /METHOD:REQUEST/);
});
