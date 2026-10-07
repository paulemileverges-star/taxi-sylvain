// Audit du 7 octobre 2026 (F03, F11) : la console du Dispatch ouverte sur un ordinateur réglé sur
// Paris. Les heures saisies et les colonnes de la Cédule doivent rester celles du Québec.
process.env.TZ = "Europe/Paris";

import { test } from "node:test";
import assert from "node:assert/strict";

const { heureMontrealVersIso, isoVersSaisieMontreal } = await import("../../apps/dispatch-web/src/lib/semaines.js");
const { startOfWeek, scheduleItemsForDay, jourMois } = await import("../../apps/dispatch-web/src/lib/scheduleOrder.js");
const PARIS = new Date("2026-07-01T12:00:00Z").getTimezoneOffset() === -120;

test("F03 : « 10:00 » saisi depuis Paris est 10:00 à Montréal, en été comme en hiver", { skip: !PARIS && "fuseau de Paris indisponible" }, () => {
  assert.equal(heureMontrealVersIso("2026-10-10T10:00"), "2026-10-10T14:00:00.000Z", "heure avancée de l'Est (UTC-4)");
  assert.equal(heureMontrealVersIso("2026-12-10T10:00"), "2026-12-10T15:00:00.000Z", "heure normale de l'Est (UTC-5)");
  assert.equal(isoVersSaisieMontreal("2026-10-10T14:00:00.000Z"), "2026-10-10T10:00");
  assert.equal(isoVersSaisieMontreal("2026-12-10T15:00:00.000Z"), "2026-12-10T10:00");
  assert.equal(heureMontrealVersIso(""), null);
  assert.equal(heureMontrealVersIso("pas une date"), null);
  assert.equal(isoVersSaisieMontreal(null), "");
});

test("F11 : depuis Paris, une course du samedi 23 h 30 (Québec) reste dans la colonne du samedi", { skip: !PARIS && "fuseau de Paris indisponible" }, () => {
  const semaine = startOfWeek(new Date("2026-10-07T12:00:00Z"));
  assert.equal(semaine.toISOString(), "2026-10-05T04:00:00.000Z", "lundi 5 octobre, minuit au Québec");
  const samediSoir = { id: "tardive", scheduledFor: "2026-10-11T03:30:00.000Z" }; // samedi 10 octobre 23 h 30 au Québec
  assert.deepEqual(scheduleItemsForDay({ rides: [samediSoir], entries: [], weekStart: semaine, dayIndex: 5 }).map((i) => i.ride.id), ["tardive"]);
  assert.equal(scheduleItemsForDay({ rides: [samediSoir], entries: [], weekStart: semaine, dayIndex: 6 }).length, 0);
  assert.equal(jourMois(semaine), "5/10", "en-tête de colonne au calendrier du Québec");
});

test("B10 : une course immédiate (sans heure prévue) apparaît le jour de sa création", () => {
  const semaine = startOfWeek(new Date("2026-10-07T12:00:00Z"));
  const immediate = { id: "immediate", scheduledFor: null, createdAt: "2026-10-07T18:00:00.000Z" }; // mercredi
  assert.deepEqual(scheduleItemsForDay({ rides: [immediate], entries: [], weekStart: semaine, dayIndex: 2 }).map((i) => i.ride.id), ["immediate"]);
});

test("F03 (application Client) : date et heure choisies depuis Paris = heure de Montréal", { skip: !PARIS && "fuseau de Paris indisponible" }, async () => {
  const { heureMontrealVersIso: client, heure } = await import("../../apps/client-app/src/lib/dates.js");
  assert.equal(client("2026-10-10", "10:00"), "2026-10-10T14:00:00.000Z");
  assert.equal(client("2026-12-10", "10:00"), "2026-12-10T15:00:00.000Z");
  assert.equal(heure(client("2026-10-10", "10:00")), "10:00", "réaffichée à l'heure de Montréal");
  assert.equal(client("2026-10-10", ""), null, "l'heure est exigée avec la date");
  assert.equal(client("", "10:00"), null);
});
