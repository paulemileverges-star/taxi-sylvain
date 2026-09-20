// Ordre des listes de courses des applications (demande du propriétaire du 20 septembre 2026) :
// « à venir » de la plus proche à la plus lointaine, « passées » par journée la plus récente, et
// dans chaque journée par heure croissante. Le découpage en pages suit ce même ordre : sans cela,
// la page 1 contiendrait déjà les mauvaises courses.
import { test } from "node:test";
import assert from "node:assert/strict";

const { rideMoment, rideDay, compareRides, pageDeCourses, FUSEAU_TAXI } = await import("../src/lib/ridesOrder.js");

const course = (id, scheduledFor, createdAt = "2026-09-01T12:00:00Z") => ({ id, scheduledFor, createdAt });
const ids = (r) => r.map((x) => x.id);

test("« à venir » : de la plus proche à la plus lointaine, quel que soit l'ordre de saisie", () => {
  const rides = [
    course("dans-trois-semaines", "2026-10-12T14:00:00Z", "2026-09-20T08:00:00Z"),
    course("demain", "2026-09-21T14:00:00Z", "2026-09-14T08:00:00Z"),
    course("ce-soir", "2026-09-20T23:00:00Z", "2026-09-19T08:00:00Z"),
  ];
  assert.deepEqual(ids(pageDeCourses(rides, { when: "upcoming" }).rides), ["ce-soir", "demain", "dans-trois-semaines"]);
});

test("une course immédiate est classée à son heure de création, pas rejetée en fin de liste", () => {
  const rides = [
    course("planifiee-15h", "2026-09-21T19:00:00Z"),
    { id: "immediate-10h", scheduledFor: null, createdAt: "2026-09-21T14:00:00Z" },
  ];
  assert.deepEqual(ids(pageDeCourses(rides, { when: "upcoming" }).rides), ["immediate-10h", "planifiee-15h"]);
  assert.equal(rideMoment({ scheduledFor: null, createdAt: "2026-09-21T14:00:00Z" }), Date.parse("2026-09-21T14:00:00Z"));
});

test("« passées » : la journée la plus récente d'abord, et dans la journée les heures croissantes", () => {
  const rides = [
    course("hier-8h", "2026-09-19T12:00:00Z"),
    course("hier-18h", "2026-09-19T22:00:00Z"),
    course("avant-hier-9h", "2026-09-18T13:00:00Z"),
  ];
  assert.deepEqual(ids(pageDeCourses(rides, { when: "past" }).rides), ["hier-8h", "hier-18h", "avant-hier-9h"]);
});

test("la pagination ne perd ni ne double aucune course, même à heures identiques", () => {
  const rides = Array.from({ length: 21 }, (_, i) =>
    course(`c${String(i).padStart(2, "0")}`, i % 3 === 0 ? "2026-09-21T14:00:00Z" : `2026-09-2${1 + (i % 5)}T1${i % 9}:00:00Z`)
  );
  const vues = [];
  for (const page of [1, 2, 3]) vues.push(...ids(pageDeCourses(rides, { when: "upcoming", page }).rides));
  assert.equal(vues.length, 21);
  assert.equal(new Set(vues).size, 21, "aucune course vue deux fois");
});

test("l'ordre ne dépend pas de l'ordre d'arrivée des lignes de la base", () => {
  const rides = Array.from({ length: 12 }, (_, i) => course(`r${i}`, `2026-09-2${1 + (i % 3)}T1${i % 6}:00:00Z`));
  const page1 = ids(pageDeCourses(rides, { when: "upcoming", page: 1, pageSize: 5 }).rides);
  const melange = [...rides].reverse();
  assert.deepEqual(ids(pageDeCourses(melange, { when: "upcoming", page: 1, pageSize: 5 }).rides), page1);
});

test("le total compte toutes les courses, et une page au-delà de la fin est vide", () => {
  const rides = Array.from({ length: 12 }, (_, i) => course(`r${i}`, `2026-09-2${1 + (i % 3)}T10:00:00Z`));
  const p2 = pageDeCourses(rides, { when: "upcoming", page: 2, pageSize: 10 });
  assert.equal(p2.total, 12);
  assert.equal(p2.rides.length, 2);
  const p9 = pageDeCourses(rides, { when: "upcoming", page: 9, pageSize: 10 });
  assert.equal(p9.rides.length, 0);
  assert.equal(p9.total, 12, "le total ne change pas");
});

test("une page ou une taille de page absurde ne fait plus échouer la requête", () => {
  const rides = [course("a", "2026-09-21T10:00:00Z")];
  for (const mauvais of [{}, { page: "abc" }, { page: 0 }, { page: -3 }, { pageSize: 0 }, { pageSize: -10 }, { pageSize: "x" }]) {
    const r = pageDeCourses(rides, { when: "upcoming", ...mauvais });
    assert.ok(Number.isInteger(r.page) && r.page >= 1, JSON.stringify(mauvais));
    assert.ok(Number.isInteger(r.pageSize) && r.pageSize >= 1 && r.pageSize <= 50, JSON.stringify(mauvais));
  }
  assert.equal(pageDeCourses(rides, { when: "upcoming", pageSize: 999 }).pageSize, 50, "jamais plus de 50 d'un coup");
});

test("une course de 23 h 30 au Québec reste dans SA journée, même si l'heure universelle dit demain", () => {
  // 2026-09-22T03:30:00Z = 21 septembre 23 h 30 à Montréal.
  const { dayKey, dayLabel } = rideDay(course("tardive", "2026-09-22T03:30:00Z"));
  assert.equal(dayKey, "2026-09-21");
  assert.equal(dayLabel, "lundi 21 septembre");
  assert.equal(FUSEAU_TAXI, "America/Toronto");
});

test("le changement d'heure ne coupe pas la journée en deux", () => {
  // Le 1er novembre 2026, l'heure recule à 2 h du matin au Québec.
  const avant = rideDay(course("avant", "2026-11-01T05:30:00Z")); // 01 h 30 heure avancée
  const apres = rideDay(course("apres", "2026-11-01T06:30:00Z")); // 01 h 30 heure normale
  assert.equal(avant.dayKey, "2026-11-01");
  assert.equal(apres.dayKey, "2026-11-01");
  assert.deepEqual(
    ids(pageDeCourses([course("apres", "2026-11-01T06:30:00Z"), course("avant", "2026-11-01T05:30:00Z")], { when: "upcoming" }).rides),
    ["avant", "apres"]
  );
});

test("le titre de journée est en français, sans dépendre de la langue du serveur", () => {
  assert.equal(rideDay(course("x", "2026-01-05T17:00:00Z")).dayLabel, "lundi 5 janvier");
  assert.equal(rideDay(course("y", "2026-08-03T16:00:00Z")).dayLabel, "lundi 3 août");
  assert.equal(rideDay(course("z", "2026-12-25T17:00:00Z")).dayLabel, "vendredi 25 décembre");
});

test("une course sans date lisible part en fin de liste sans désordonner les autres", () => {
  const rides = [
    { id: "cassee", scheduledFor: "pas une date", createdAt: "pas une date non plus" },
    course("b", "2026-09-21T14:00:00Z"),
    course("a", "2026-09-21T09:00:00Z"),
  ];
  assert.deepEqual(ids(pageDeCourses(rides, { when: "upcoming" }).rides), ["a", "b", "cassee"]);
  assert.equal(rideDay({ scheduledFor: null, createdAt: null }).dayLabel, "Date inconnue");
  assert.ok(!Number.isNaN(compareRides(rides[0], rides[1], "upcoming")));
});

test("le tri ne modifie jamais la liste reçue", () => {
  const rides = [course("b", "2026-09-22T10:00:00Z"), course("a", "2026-09-21T10:00:00Z")];
  const copie = JSON.stringify(rides);
  pageDeCourses(rides, { when: "upcoming" });
  assert.equal(JSON.stringify(rides), copie);
});

test("chaque course de la page porte sa journée, prête à afficher", () => {
  const page = pageDeCourses([course("a", "2026-09-21T14:00:00Z")], { when: "upcoming" });
  assert.equal(page.rides[0].dayKey, "2026-09-21");
  assert.equal(page.rides[0].dayLabel, "lundi 21 septembre");
});
