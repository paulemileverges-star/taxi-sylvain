// Récapitulatif hebdomadaire : la semaine se compte à l'heure du Québec, pas à celle du serveur.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";

const { mondayOf, previousWeekRange, minuitQuebec, messageRecap } = await import("../src/jobs/weeklyReport.js");

test("minuit au Québec : 04 h UTC en été, 05 h UTC en hiver", () => {
  assert.equal(minuitQuebec(2026, 9, 21).toISOString(), "2026-09-21T04:00:00.000Z");
  assert.equal(minuitQuebec(2026, 12, 7).toISOString(), "2026-12-07T05:00:00.000Z");
});

test("le lundi de la semaine est trouvé à l'heure du Québec, même autour de minuit", () => {
  // Dimanche 20 septembre 2026, 23 h 30 à Montréal = lundi 03 h 30 UTC : c'est encore dimanche.
  assert.equal(mondayOf(new Date("2026-09-21T03:30:00Z")).toISOString(), "2026-09-14T04:00:00.000Z");
  // Lundi 21 septembre 00 h 05 à Montréal.
  assert.equal(mondayOf(new Date("2026-09-21T04:05:00Z")).toISOString(), "2026-09-21T04:00:00.000Z");
  // Un lundi passé en paramètre reste le même lundi.
  assert.equal(mondayOf(new Date("2026-09-21T04:00:00Z")).toISOString(), "2026-09-21T04:00:00.000Z");
});

test("le récap du lundi 00 h 05 couvre du lundi précédent 00 h 00 au dimanche 23 h 59 min 59 s, heure du Québec", () => {
  const { weekStart, weekEnd } = previousWeekRange(new Date("2026-09-21T04:05:00Z"));
  assert.equal(weekStart.toISOString(), "2026-09-14T04:00:00.000Z");
  assert.equal(weekEnd.toISOString(), "2026-09-21T03:59:59.999Z");
  // Course terminée le dimanche 20 septembre à 22 h à Montréal : dans la semaine qui se termine.
  const dimancheSoir = new Date("2026-09-21T02:00:00Z");
  assert.ok(dimancheSoir >= weekStart && dimancheSoir <= weekEnd, "le dimanche soir compte dans la semaine écoulée, pas dans la suivante");
});

test("la semaine du changement d'heure garde ses bornes à minuit (pas 23 h ni 1 h)", () => {
  // L'heure d'été se termine le dimanche 1er novembre 2026. Lundi 2 novembre 00 h 05 EST = 05 h 05 UTC.
  const { weekStart, weekEnd } = previousWeekRange(new Date("2026-11-02T05:05:00Z"));
  assert.equal(weekStart.toISOString(), "2026-10-26T04:00:00.000Z", "lundi 26 octobre 00 h 00 EDT");
  assert.equal(weekEnd.toISOString(), "2026-11-02T04:59:59.999Z", "dimanche 1er novembre 23 h 59 EST");
});

test("le courriel de récap reprend les chiffres du rapport et la période en français", () => {
  const { subject, html, text } = messageRecap({
    nom: "Jean Roy", weekStart: new Date("2026-09-14T04:00:00Z"), weekEnd: new Date("2026-09-21T03:59:59.999Z"),
    rideCount: 7, totalFare: 812.5, royaltyDue: 81.25, lienApp: "https://chauffeur.taxisylvain.ca",
  });
  assert.match(subject, /du 14 septembre au 20 septembre 2026/);
  assert.match(html, /Bonjour Jean,/);
  assert.match(html, /7 courses/);
  assert.match(html, /812\.50 \$/);
  assert.match(html, /81\.25 \$/);
  assert.match(text, /https:\/\/chauffeur\.taxisylvain\.ca/);
  const seule = messageRecap({ nom: "", weekStart: new Date("2026-09-14T04:00:00Z"), weekEnd: new Date("2026-09-21T03:59:59.999Z"), rideCount: 1, totalFare: 60, royaltyDue: 6 });
  assert.match(seule.text, /1 course\b/);
  assert.match(seule.html, /Bonjour,/);
});

// Demande du propriétaire (20 septembre, soir) : le récap part aussi par courriel au Dispatch.
test("la synthèse au Dispatch liste chaque chauffeur et les totaux, et dit quand la semaine est vide", async () => {
  const { messageRecapDispatch } = await import("../src/jobs/weeklyReport.js");
  const semaine = { weekStart: new Date("2026-09-14T04:00:00Z"), weekEnd: new Date("2026-09-21T03:59:59.999Z") };
  const m = messageRecapDispatch({ ...semaine, lignes: [
    { name: "Jean Roy", rideCount: 7, totalFare: 812.5, royaltyDue: 81.25 },
    { name: "Paul Côté", rideCount: 3, totalFare: 200, royaltyDue: 20 },
  ] });
  assert.match(m.subject, /du 14 septembre au 20 septembre 2026/);
  assert.match(m.text, /10 course\(s\), 1012\.50 \$ de courses, 101\.25 \$ de redevance/);
  assert.match(m.html, /Jean Roy/);
  assert.match(m.html, /Paul Côté/);
  assert.match(m.text, /- Paul Côté : 3 course\(s\), 200\.00 \$, redevance 20\.00 \$/);
  const vide = messageRecapDispatch({ ...semaine, lignes: [] });
  assert.match(vide.text, /Aucune course terminée cette semaine/);
  assert.match(vide.html, /Aucune course terminée cette semaine/);
});
