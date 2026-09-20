// Page Courses de la console : recherche, filtres et pagination (règle partagée avec le Dispatch).
import { test } from "node:test";
import assert from "node:assert/strict";

const { correspond, filtrerCourses, paginer, PAGE_SIZE } = await import("../../apps/dispatch-web/src/lib/coursesFilter.js");

// Dates construites en heure locale : « aujourd'hui » suit le fuseau du navigateur du Dispatch.
const NOW = new Date(2026, 8, 20, 15, 0, 0);
const jour = (decalage, heure = 10) => new Date(2026, 8, 20 + decalage, heure, 0, 0).toISOString();
const c = (id, extra = {}) => ({ id, status: "ACCEPTED", pickupAddress: "12 Rue Bourgogne, Chambly", destAddress: "Aéroport YUL", client: { name: "Marie Tremblay" }, driver: null, driverId: null, scheduledFor: jour(1), createdAt: jour(-1), ...extra });

test("la recherche ignore accents et majuscules, sur le client, le chauffeur, les adresses et le vol", () => {
  const ride = c("r1", { driver: { name: "Jean Roy" }, flightNumber: "AC1234" });
  assert.equal(correspond(ride, "tremblay"), true);
  assert.equal(correspond(ride, "MARIE"), true);
  assert.equal(correspond(ride, "aeroport"), true, "« aeroport » trouve « Aéroport »");
  assert.equal(correspond(ride, "roy"), true);
  assert.equal(correspond(ride, "ac1234"), true);
  assert.equal(correspond(ride, "longueuil"), false);
  assert.equal(correspond(ride, "   "), true, "recherche vide : tout passe");
});

test("filtre par statut, par chauffeur et « non assignées »", () => {
  const rides = [
    c("a", { status: "REQUESTED" }),
    c("b", { status: "ACCEPTED", driverId: "d1", driver: { name: "Jean" } }),
    c("c", { status: "COMPLETED", driverId: "d2", driver: { name: "Paul" } }),
  ];
  assert.deepEqual(filtrerCourses(rides, { statut: "ACCEPTED" }, NOW).map((r) => r.id), ["b"]);
  assert.deepEqual(filtrerCourses(rides, { driverId: "d2" }, NOW).map((r) => r.id), ["c"]);
  assert.deepEqual(filtrerCourses(rides, { driverId: "__none__" }, NOW).map((r) => r.id), ["a"]);
});

test("périodes : aujourd'hui, à venir, 7 derniers jours, terminées", () => {
  const rides = [
    c("ce-matin", { scheduledFor: jour(0, 9) }),
    c("ce-soir", { scheduledFor: jour(0, 21) }),
    c("demain", { scheduledFor: jour(1) }),
    c("hier-faite", { status: "COMPLETED", scheduledFor: jour(-1) }),
    c("vieille", { status: "CANCELLED", scheduledFor: jour(-20) }),
  ];
  assert.deepEqual(filtrerCourses(rides, { periode: "today" }, NOW).map((r) => r.id), ["ce-matin", "ce-soir"], "aujourd'hui, par heure croissante");
  assert.deepEqual(filtrerCourses(rides, { periode: "upcoming" }, NOW).map((r) => r.id), ["ce-matin", "ce-soir", "demain"]);
  assert.deepEqual(filtrerCourses(rides, { periode: "week" }, NOW).map((r) => r.id), ["ce-matin", "hier-faite"]);
  assert.deepEqual(filtrerCourses(rides, { periode: "past" }, NOW).map((r) => r.id), ["hier-faite", "vieille"], "terminées, les plus récentes d'abord");
  assert.deepEqual(filtrerCourses(rides, {}, NOW).map((r) => r.id), ["demain", "ce-soir", "ce-matin", "hier-faite", "vieille"], "toutes : de la plus récente à la plus ancienne");
});

test("pagination : 20 par page, numéro de page borné", () => {
  assert.equal(PAGE_SIZE, 20);
  const liste = Array.from({ length: 45 }, (_, i) => ({ id: `r${i}` }));
  const p1 = paginer(liste, 1);
  assert.equal(p1.items.length, 20);
  assert.equal(p1.pages, 3);
  assert.equal(p1.total, 45);
  assert.equal(paginer(liste, 3).items.length, 5);
  assert.equal(paginer(liste, 99).page, 3, "au-delà de la dernière page : dernière page");
  assert.equal(paginer(liste, 0).page, 1);
  assert.equal(paginer([], 1).pages, 1);
});
