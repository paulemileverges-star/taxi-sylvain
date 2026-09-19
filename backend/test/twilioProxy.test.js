// Appel masqué (Twilio Proxy) : Twilio n'accepte que le format international E.164. Les numéros
// saisis librement dans les fiches doivent être convertis, sinon l'appel échoue sans explication.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getOrCreateCallSession, toE164 } from "../src/lib/twilioProxy.js";

test("les formats de saisie courants au Québec deviennent un numéro international", () => {
  for (const saisie of [
    "514-555-1234",
    "(514) 555-1234",
    "514.555.1234",
    "514 555 1234",
    "5145551234",
    "1 514 555 1234",
    "1-514-555-1234",
    "+1 514 555 1234",
    "+15145551234",
  ]) {
    assert.equal(toE164(saisie), "+15145551234", saisie);
  }
  assert.equal(toE164("(438) 499-1120"), "+14384991120");
  assert.equal(toE164("450-555-0199"), "+14505550199");
});

test("un poste téléphonique est écarté, car Twilio ne peut pas le composer", () => {
  assert.equal(toE164("514-555-1234 poste 12"), "+15145551234");
  assert.equal(toE164("514-555-1234 ext. 5"), "+15145551234");
  assert.equal(toE164("514.555.1234 x12"), "+15145551234");
  assert.equal(toE164("514 555 1234 #3"), "+15145551234");
});

test("un numéro étranger est accepté s'il est écrit avec son indicatif", () => {
  assert.equal(toE164("+33 6 12 34 56 78"), "+33612345678");
  assert.equal(toE164("0033 6 12 34 56 78"), "+33612345678");
  assert.equal(toE164("+44 20 7946 0958"), "+442079460958");
});

test("un numéro incomplet ou impossible est refusé plutôt que transmis à Twilio", () => {
  for (const saisie of ["", "   ", "555-1234", "0145551234", "1145551234", "+1 045 555 1234", "12345678901234567", "pas de numéro"]) {
    assert.equal(toE164(saisie), null, `« ${saisie} » aurait dû être refusé`);
  }
  assert.equal(toE164(null), null);
  assert.equal(toE164(undefined), null);
  assert.equal(toE164(5145551234), null);
});

test("un numéro invalide donne un message clair, sans révéler le numéro de l'autre partie", async () => {
  const ride = {
    id: "course1",
    client: { name: "Client", phone: "555-9876" },
    driver: { name: "Chauffeur", phone: "514-555-1234" },
  };
  await assert.rejects(getOrCreateCallSession(ride), (err) => {
    assert.equal(err.status, 400);
    assert.match(err.message, /numéro de téléphone du client/);
    assert.ok(!err.message.includes("9876"), "le message ne doit jamais contenir le numéro");
    return true;
  });

  await assert.rejects(
    getOrCreateCallSession({ ...ride, client: { name: "Client", phone: "514-555-0000" }, driver: { name: "Chauffeur", phone: "" } }),
    (err) => err.status === 400 && /du chauffeur/.test(err.message)
  );
});
