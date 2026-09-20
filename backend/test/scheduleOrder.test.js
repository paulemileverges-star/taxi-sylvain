// Ordre de la Cédule du Dispatch (demande du propriétaire du 20 septembre 2026) : dans une
// journée, les courses et les créneaux doivent s'afficher du plus tôt au plus tard.
// Le module testé vit dans la console Dispatch mais ne contient que du JavaScript pur.
process.env.TZ = "America/Toronto";

import { test } from "node:test";
import assert from "node:assert/strict";

const { startOfWeek, addDays, sameCivilDay, scheduleItemTime, sortScheduleItems, scheduleItemsForDay } =
  await import("../../apps/dispatch-web/src/lib/scheduleOrder.js");

// Si le fuseau du Québec n'est pas appliqué, les tests de changement d'heure ne prouveraient rien.
const FUSEAU_QUEBEC = new Date("2026-07-01T12:00:00Z").getTimezoneOffset() === 240;

const course = (id, scheduledFor, extra = {}) => ({ id, scheduledFor, ...extra });
const creneau = (id, startsAt) => ({ id, startsAt });
const lundi = (h, m = 0) => new Date(2026, 8, 21, h, m).toISOString(); // 21 septembre 2026, un lundi

test("dans une journée, les courses sont classées de la plus tôt à la plus tard", () => {
  const semaine = startOfWeek(new Date(2026, 8, 21));
  // Ordre d'arrivée : celui du serveur, de la plus récemment saisie à la plus ancienne.
  const rides = [course("c1", lundi(14, 30)), course("c2", lundi(6, 15)), course("c3", lundi(9))];
  const jour = scheduleItemsForDay({ rides, entries: [], weekStart: semaine, dayIndex: 0 });
  assert.deepEqual(jour.map((i) => i.ride.id), ["c2", "c3", "c1"]);
});

test("courses et créneaux sont mélangés dans un seul ordre horaire", () => {
  const semaine = startOfWeek(new Date(2026, 8, 21));
  const jour = scheduleItemsForDay({
    rides: [course("c9", lundi(9)), course("c12", lundi(12))],
    entries: [creneau("s7", lundi(7)), creneau("s18", lundi(18))],
    weekStart: semaine,
    dayIndex: 0,
  });
  assert.deepEqual(jour.map((i) => i.id), ["slot-s7", "ride-c9", "ride-c12", "slot-s18"]);
});

test("l'heure qui fait foi est celle de la prise en charge, pas celle de la saisie", () => {
  const semaine = startOfWeek(new Date(2026, 8, 21));
  const rides = [
    course("tardive", lundi(20), { createdAt: new Date(2026, 8, 1).toISOString() }),
    course("matinale", lundi(6), { createdAt: new Date(2026, 8, 20).toISOString() }),
  ];
  const jour = scheduleItemsForDay({ rides, entries: [], weekStart: semaine, dayIndex: 0 });
  assert.deepEqual(jour.map((i) => i.ride.id), ["matinale", "tardive"]);
});

test("sans heure de prise en charge, l'heure de création sert de repli", () => {
  const item = { kind: "ride", id: "ride-x", ride: { id: "x", createdAt: lundi(8) } };
  assert.equal(scheduleItemTime(item), Date.parse(lundi(8)));
});

test("une date absente ou illisible finit en bas de la journée, jamais en tête", () => {
  assert.equal(scheduleItemTime({ kind: "ride", ride: { id: "y" } }), Number.POSITIVE_INFINITY);
  assert.equal(scheduleItemTime({ kind: "slot", entry: { startsAt: "pas une date" } }), Number.POSITIVE_INFINITY);
  const classe = sortScheduleItems([
    { kind: "ride", id: "ride-sansdate", ride: { id: "sansdate" } },
    { kind: "ride", id: "ride-9h", ride: { id: "9h", scheduledFor: lundi(9) } },
  ]);
  assert.deepEqual(classe.map((i) => i.id), ["ride-9h", "ride-sansdate"]);
});

test("le classement ne dépend pas de l'ordre d'arrivée, et la course passe avant le créneau à heure égale", () => {
  const items = [
    { kind: "slot", id: "slot-a", entry: { startsAt: lundi(9) } },
    { kind: "ride", id: "ride-b", ride: { scheduledFor: lundi(9) } },
    { kind: "ride", id: "ride-c", ride: { scheduledFor: lundi(7) } },
  ];
  const attendu = ["ride-c", "ride-b", "slot-a"];
  assert.deepEqual(sortScheduleItems(items).map((i) => i.id), attendu);
  assert.deepEqual(sortScheduleItems([...items].reverse()).map((i) => i.id), attendu);
});

test("le tri ne modifie jamais la liste reçue", () => {
  const items = [
    { kind: "ride", id: "ride-2", ride: { scheduledFor: lundi(15) } },
    { kind: "ride", id: "ride-1", ride: { scheduledFor: lundi(8) } },
  ];
  const copie = [...items];
  sortScheduleItems(items);
  assert.deepEqual(items, copie, "l'état React d'origine doit rester intact");
});

test("une course d'une autre journée n'apparaît pas dans la colonne", () => {
  const semaine = startOfWeek(new Date(2026, 8, 21));
  const rides = [course("lundi", lundi(9)), course("mardi", new Date(2026, 8, 22, 9).toISOString())];
  assert.deepEqual(scheduleItemsForDay({ rides, entries: [], weekStart: semaine, dayIndex: 0 }).map((i) => i.ride.id), ["lundi"]);
  assert.deepEqual(scheduleItemsForDay({ rides, entries: [], weekStart: semaine, dayIndex: 1 }).map((i) => i.ride.id), ["mardi"]);
});

test("le passage à l'heure normale ne fait plus disparaître la course du dimanche soir", { skip: !FUSEAU_QUEBEC && "fuseau du Québec indisponible" }, () => {
  // Semaine du lundi 26 octobre 2026 : le changement d'heure a lieu le dimanche 1er novembre.
  const semaine = startOfWeek(new Date(2026, 9, 26));
  const dimancheSoir = new Date(2026, 10, 1, 23, 30).toISOString();
  const jour = scheduleItemsForDay({ rides: [course("tardive", dimancheSoir)], entries: [], weekStart: semaine, dayIndex: 6 });
  assert.equal(jour.length, 1, "la course du dimanche 1er novembre 23 h 30 doit rester visible");
});

test("avancer d'une semaine reste un lundi, même la semaine du changement d'heure", { skip: !FUSEAU_QUEBEC && "fuseau du Québec indisponible" }, () => {
  for (const depart of [new Date(2026, 9, 26), new Date(2026, 2, 2)]) {
    const suivante = addDays(startOfWeek(depart), 7);
    assert.equal(suivante.getDay(), 1, "la semaine suivante doit commencer un lundi");
    assert.equal(suivante.getHours(), 0, "et à minuit");
  }
});

test("une course du lundi suivant ne remonte pas dans la semaine précédente", { skip: !FUSEAU_QUEBEC && "fuseau du Québec indisponible" }, () => {
  // Semaine du 2 mars 2026 ; l'heure avance le 8 mars. La course est le lundi 9 mars à 00 h 30.
  const semaine = startOfWeek(new Date(2026, 2, 2));
  const lundiSuivant = new Date(2026, 2, 9, 0, 30).toISOString();
  const colonne = scheduleItemsForDay({ rides: [course("suivante", lundiSuivant)], entries: [], weekStart: semaine, dayIndex: 0 });
  assert.equal(colonne.length, 0, "elle appartient à la semaine suivante");
});

test("le même jour du calendrier est reconnu, quelle que soit l'heure", () => {
  assert.ok(sameCivilDay(new Date(2026, 8, 21, 0, 5), new Date(2026, 8, 21, 23, 55)));
  assert.ok(!sameCivilDay(new Date(2026, 8, 21, 23, 55), new Date(2026, 8, 22, 0, 5)));
});
