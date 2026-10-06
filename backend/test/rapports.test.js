// Règle de calcul des rapports (lib/rapports.js), demandée par le propriétaire le 6 octobre 2026 :
// les rapports doivent correspondre au tableau tenu par Taxi Sylvain, qui compte chaque course à sa
// date. Les montants et les dates ci-dessous reprennent la semaine du 21 au 27 septembre 2026 de ce
// tableau (11 courses, 1 305 $, redevance 130,50 $) ; les noms des clients sont fictifs.
import test from "node:test";
import assert from "node:assert/strict";
import { rapportPeriode, recapsHebdomadaires, ligneCourse, villeDe, filtrePeriode, totaux } from "../src/lib/rapports.js";
import { semaineDe } from "../src/lib/semaines.js";

// Heure du Québec en septembre : UTC-4. « 2026-09-21T10:00 » au Québec = 14:00 UTC.
const q = (jourHeure) => new Date(`${jourHeure}:00-04:00`);
const TABLEAU = [
  ["2026-09-21T06:00", 90, "Varennes"],
  ["2026-09-21T13:30", 135, "Saint-Hyacinthe"],
  ["2026-09-22T05:15", 155, "Granby"],
  ["2026-09-24T04:45", 95, "Saint-Jean-sur-Richelieu"],
  ["2026-09-24T16:00", 195, "Shefford"],
  ["2026-09-25T05:00", 100, "Saint-Amable"],
  ["2026-09-25T09:30", 135, "Saint-Hyacinthe"],
  ["2026-09-25T14:00", 100, "Mont-Saint-Hilaire"],
  ["2026-09-25T19:00", 105, "Saint-Amable"],
  ["2026-09-27T08:00", 100, "Saint-Jean-sur-Richelieu"],
  ["2026-09-27T22:30", 95, "Saint-Jean-sur-Richelieu"],
];
const YVES = { id: "chauffeuryves01", name: "Yves Christopher" };

function courses() {
  return TABLEAU.map(([quand, fare, ville], i) => ({
    id: `course${String(i + 1).padStart(2, "0")}`,
    status: "COMPLETED",
    scheduledFor: q(quand),
    createdAt: q("2026-09-15T10:00"),
    // La course de 22 h 30 le dimanche est terminée dans l'application après minuit, le lundi :
    // l'ancien calcul la comptait dans la semaine suivante.
    completedAt: i === 10 ? q("2026-09-28T00:40") : new Date(q(quand).getTime() + 60 * 60 * 1000),
    fare,
    royaltyRate: 0.1,
    driverId: YVES.id,
    driver: YVES,
    client: { name: `Client ${i + 1}` },
    pickupAddress: `${100 + i} Rue Principale, ${ville}, QC J0L 1A0`,
    destAddress: "975 Boulevard Roméo-Vachon Nord (Arrivées), Dorval, QC H4Y 1H1",
    stops: [],
  }));
}

test("la semaine du 21 au 27 septembre donne exactement le tableau de Taxi Sylvain : 11 courses, 1 305 $, 130,50 $", () => {
  const r = rapportPeriode(courses());
  assert.equal(r.chauffeurs.length, 1);
  const yves = r.chauffeurs[0];
  assert.equal(yves.chauffeur.name, "Yves Christopher");
  assert.equal(yves.effectuees.nombre, 11);
  assert.equal(yves.effectuees.montant, 1305);
  assert.equal(yves.effectuees.redevance, 130.5);
  assert.deepEqual(yves.courses.map((c) => c.date), TABLEAU.map(([quand]) => quand.slice(0, 10)), "dates de course, dans l'ordre");
  assert.equal(yves.courses[10].heure, "22:30", "heure sur 24 heures");
});

test("une course compte dans la semaine de sa date, même terminée dans l'application le lundi suivant", () => {
  const recaps = recapsHebdomadaires(courses(), { avant: q("2026-10-05T00:00") });
  assert.equal(recaps.length, 1, "une seule semaine : aucune course ne glisse dans la suivante");
  assert.equal(recaps[0].rideCount, 11);
  assert.equal(recaps[0].totalFare, 1305);
  assert.equal(recaps[0].royaltyDue, 130.5);
  assert.equal(recaps[0].weekStart.toISOString(), q("2026-09-21T00:00").toISOString());
  assert.equal(recaps[0].weekEnd.toISOString(), new Date(q("2026-09-28T00:00").getTime() - 1).toISOString());
});

test("la semaine en cours n'apparaît pas dans « Mes rapports » (elle est dans « Mes revenus »)", () => {
  const recaps = recapsHebdomadaires(courses(), { avant: q("2026-09-21T00:00") });
  assert.equal(recaps.length, 0);
});

test("les courses à effectuer sont listées à part, les annulées ne comptent nulle part", () => {
  const liste = [
    ...courses(),
    { id: "afaire1", status: "ACCEPTED", scheduledFor: q("2026-09-26T07:00"), createdAt: q("2026-09-20T10:00"), fare: 120, royaltyRate: 0.1, driverId: YVES.id, driver: YVES, pickupAddress: "1 Rue A, Chambly, QC", destAddress: "YUL", stops: [] },
    { id: "annulee1", status: "CANCELLED", scheduledFor: q("2026-09-26T09:00"), createdAt: q("2026-09-20T10:00"), fare: 80, royaltyRate: 0.1, driverId: YVES.id, driver: YVES, pickupAddress: "2 Rue B, Chambly, QC", destAddress: "YUL", stops: [] },
    { id: "libre1", status: "REQUESTED", scheduledFor: q("2026-09-26T11:00"), createdAt: q("2026-09-20T10:00"), fare: 0, royaltyRate: 0.1, driverId: null, pickupAddress: "3 Rue C, Varennes, QC", destAddress: "YUL", stops: [] },
  ];
  const r = rapportPeriode(liste);
  const yves = r.chauffeurs[0];
  assert.equal(yves.effectuees.montant, 1305, "la course à effectuer ne gonfle pas le total effectué");
  assert.equal(yves.aEffectuer.nombre, 1);
  assert.equal(yves.aEffectuer.montant, 120);
  assert.equal(yves.courses.length, 12, "les courses à effectuer sont listées avec les effectuées");
  assert.equal(r.annulees, 1);
  assert.equal(r.nonAssignees.courses.length, 1);
  assert.equal(r.general.effectuees.redevance, 130.5);
});

test("chaque chauffeur a son bloc et ses totaux, classés par nom", () => {
  const autre = { id: "chauffeurbob01", name: "Bob Tremblay" };
  const liste = [
    ...courses(),
    { id: "bob1", status: "COMPLETED", scheduledFor: q("2026-09-23T08:00"), createdAt: q("2026-09-20T10:00"), fare: 70, royaltyRate: 0.1, driverId: autre.id, driver: autre, pickupAddress: "4 Rue D, Longueuil, QC", destAddress: "YUL", stops: [] },
  ];
  const r = rapportPeriode(liste);
  assert.deepEqual(r.chauffeurs.map((b) => b.chauffeur.name), ["Bob Tremblay", "Yves Christopher"]);
  assert.equal(r.chauffeurs[0].effectuees.redevance, 7);
  assert.equal(r.general.effectuees.montant, 1375);
});

test("une course immédiate (sans heure prévue) compte à sa date de création", () => {
  const l = ligneCourse({ id: "x", status: "COMPLETED", scheduledFor: null, createdAt: q("2026-09-23T17:05"), fare: 50, royaltyRate: 0.1, pickupAddress: "1 Rue A, Chambly, QC J3L 1A1", destAddress: "B" });
  assert.equal(l.date, "2026-09-23");
  assert.equal(l.heure, "17:05");
  assert.equal(l.redevance, 5);
  assert.deepEqual(filtrePeriode("a", "b").OR[1], { scheduledFor: null, createdAt: { gte: "a", lte: "b" } });
});

test("la ville est lue dans l'adresse à la forme unique", () => {
  assert.equal(villeDe("12 Rue Bourgogne, Chambly, QC J3L 1Y8"), "Chambly");
  assert.equal(villeDe("975 Boulevard Roméo-Vachon Nord (Arrivées), Dorval, QC H4Y 1H1"), "Dorval");
  assert.equal(villeDe("Boulevard de Rome, Brossard, QC J4X 2A4"), "Brossard");
  assert.equal(villeDe("60 Smithfield Blvd, Plattsburgh, NY 12901, États-Unis"), "Plattsburgh");
  assert.equal(villeDe("12 Rue X, QC J3L 1Y8"), "");
  assert.equal(villeDe(""), "");
});

test("les montants sont arrondis au cent, sans erreur de virgule flottante", () => {
  const lignes = [0.1, 0.2, 0.3].map((fare, i) => ligneCourse({ id: String(i), status: "COMPLETED", scheduledFor: q("2026-09-23T08:00"), fare, royaltyRate: 0.1, pickupAddress: "a", destAddress: "b" }));
  assert.equal(totaux(lignes).effectuees.montant, 0.6);
});

test("la semaine de référence va du lundi 00 h 00 au dimanche 23 h 59, heure du Québec", () => {
  const { weekStart, weekEnd } = semaineDe(q("2026-09-27T23:59"));
  assert.equal(weekStart.toISOString(), q("2026-09-21T00:00").toISOString());
  assert.equal(weekEnd.toISOString(), new Date(q("2026-09-28T00:00").getTime() - 1).toISOString());
});
