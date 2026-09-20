// Rappels de course (demande du propriétaire du 20 septembre 2026 : « pour ne pas qu'un chauffeur
// manque une course »). Courriel 80 minutes avant, notifications fiables, et escalade à
// 60 minutes quand le chauffeur n'est pas en ligne ou n'est pas encore en route.
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  COURRIEL_AVANT_MINUTES, ESCALADE_AVANT_MINUTES, FENETRE_GRACE_MS,
  rappelEstDu, chauffeurEnRoute, escaladeNecessaire, delaiEnMots, messageRappel, messageEscalade, alerteDispatch,
} = await import("../src/lib/rappels.js");

const COURSE = new Date("2026-09-21T14:00:00Z");
const minutesAvant = (m) => new Date(COURSE.getTime() - m * 60 * 1000);
const ride = (extra = {}) => ({
  id: "r1", scheduledFor: COURSE, status: "ACCEPTED", driverId: "d1",
  pickupAddress: "12 Rue Bourgogne, Chambly, QC", destAddress: "Aéroport YUL, Dorval, QC", ...extra,
});

test("le courriel de rappel part 80 minutes avant la course", () => {
  assert.equal(COURRIEL_AVANT_MINUTES, 80);
  assert.equal(rappelEstDu({ scheduledFor: COURSE, offsetMinutes: 80, now: minutesAvant(80) }), true);
  assert.equal(rappelEstDu({ scheduledFor: COURSE, offsetMinutes: 80, now: minutesAvant(81) }), false, "pas avant l'heure");
});

test("un rappel légèrement en retard part quand même, un rappel oublié depuis longtemps non", () => {
  const troisMinutesApres = new Date(minutesAvant(80).getTime() + 3 * 60 * 1000);
  assert.equal(rappelEstDu({ scheduledFor: COURSE, offsetMinutes: 80, now: troisMinutesApres }), true);
  const uneHeureApres = new Date(minutesAvant(80).getTime() + 60 * 60 * 1000);
  assert.equal(rappelEstDu({ scheduledFor: COURSE, offsetMinutes: 80, now: uneHeureApres }), false, "on ne réveille personne pour un rappel périmé");
  assert.equal(FENETRE_GRACE_MS, 5 * 60 * 1000);
});

test("une course sans heure ou avec une date illisible ne déclenche aucun rappel", () => {
  assert.equal(rappelEstDu({ scheduledFor: null, offsetMinutes: 80, now: new Date() }), false);
  assert.equal(rappelEstDu({ scheduledFor: "pas une date", offsetMinutes: 80, now: new Date() }), false);
});

test("l'escalade se déclenche à 60 minutes quand le chauffeur est hors ligne", () => {
  assert.equal(ESCALADE_AVANT_MINUTES, 60);
  assert.equal(escaladeNecessaire({ ride: ride(), enLigne: false, now: minutesAvant(60) }), true);
});

test("elle se déclenche aussi s'il est en ligne mais pas encore en route", () => {
  assert.equal(escaladeNecessaire({ ride: ride({ status: "ACCEPTED" }), enLigne: true, now: minutesAvant(60) }), true);
});

test("elle ne se déclenche pas si le chauffeur est déjà en route ou en course", () => {
  for (const status of ["EN_ROUTE", "STARTED"]) {
    assert.equal(escaladeNecessaire({ ride: ride({ status }), enLigne: false, now: minutesAvant(60) }), false, status);
    assert.equal(chauffeurEnRoute(ride({ status })), true);
  }
});

test("elle ne se déclenche pas sur une course sans chauffeur : c'est au Dispatch de l'affecter", () => {
  assert.equal(escaladeNecessaire({ ride: ride({ driverId: null }), enLigne: false, now: minutesAvant(60) }), false);
});

test("elle ne se déclenche ni trop tôt ni deux heures après", () => {
  assert.equal(escaladeNecessaire({ ride: ride(), enLigne: false, now: minutesAvant(90) }), false);
  assert.equal(escaladeNecessaire({ ride: ride(), enLigne: false, now: minutesAvant(10) }), false);
});

test("les délais sont écrits comme on les dit", () => {
  assert.equal(delaiEnMots(10), "10 min");
  assert.equal(delaiEnMots(60), "1 h");
  assert.equal(delaiEnMots(80), "1 h 20");
  assert.equal(delaiEnMots(1440), "24 h");
});

test("le message du rappel dit l'essentiel : quand, d'où, vers où", () => {
  const { titre, texte } = messageRappel({ ride: ride(), pour: "chauffeur", offsetMinutes: 80 });
  assert.match(titre, /Course à venir/);
  assert.match(texte, /1 h 20/);
  assert.match(texte, /Rue Bourgogne/);
  assert.match(texte, /YUL/);
  assert.match(messageRappel({ ride: ride(), pour: "client", offsetMinutes: 60 }).texte, /Votre course/);
});

test("le message d'urgence dit quoi faire, pas seulement qu'il y a un problème", () => {
  const { titre, texte } = messageEscalade({ ride: ride() });
  assert.match(titre, /URGENT/);
  assert.match(texte, /pas encore en route/);
  assert.match(texte, /Mettez-vous en route|appelez/i);
});

test("le Dispatch est prévenu, avec l'état réel du chauffeur", () => {
  assert.match(alerteDispatch({ ride: ride(), nomChauffeur: "Marc", enLigne: false }), /Marc est hors ligne/);
  assert.match(alerteDispatch({ ride: ride(), nomChauffeur: "Marc", enLigne: true }), /en ligne mais pas encore en route/);
});

test("l'appel vocal reste inactif et silencieux tant que Twilio n'est pas configuré", async () => {
  const { isVoiceConfigured, appelerRappel, voiceStatusLine, twimlRappel } = await import("../src/lib/twilioVoice.js");
  const sauvegarde = { ...process.env };
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_CALLER_NUMBER;
  assert.equal(isVoiceConfigured(), false);
  assert.match(voiceStatusLine(), /inactif/);
  const r = await appelerRappel({ telephone: "450 555-1234", ride: ride() });
  assert.deepEqual(r, { skipped: true, raison: "twilio-absent" }, "aucun appel, aucune erreur");
  Object.assign(process.env, sauvegarde);
});

test("le message téléphonique nomme le départ et la destination, et résiste aux caractères spéciaux", async () => {
  const { twimlRappel } = await import("../src/lib/twilioVoice.js");
  const xml = twimlRappel({ pickupAddress: "12 Rue A & B", destAddress: "Aéroport YUL" });
  assert.match(xml, /<Say/);
  assert.match(xml, /fr-CA/);
  assert.match(xml, /&amp;/, "le & doit être échappé, sinon Twilio refuse le message");
  assert.ok(!xml.includes("& B"), xml);
});
