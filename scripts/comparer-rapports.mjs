#!/usr/bin/env node
// Contrôle des récaps hebdomadaires sur une COPIE de la base (fichier de sauvegarde), sur le PC,
// sans toucher à la production. Pour chaque chauffeur et chaque semaine, il compare :
// - le récap figé que les chauffeurs ont reçu (table WeeklyReport) ;
// - l'ancien calcul (avant le 6 octobre 2026) : courses comptées à la date où le chauffeur a appuyé
//   sur « Terminer » ;
// - le nouveau calcul : courses comptées à la date de la course (prise en charge prévue) ;
// - les courses de la semaine jamais terminées dans l'application (à faire corriger par le Dispatch).
// À comparer avec le tableau tenu par Taxi Sylvain. À lancer à la racine du dépôt :
//   node scripts/recuperer-sauvegarde.mjs            (copie fraîche dans OneDrive)
//   node scripts/comparer-rapports.mjs "<fichier .json.gz>" [--depuis 2026-09-01] [--detail]
// --detail liste les courses (date, heure, ville de départ, montant, statut), sans nom de client.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lib = (nom) => import(new URL(`../backend/src/lib/${nom}`, import.meta.url));
const { lireFichierSauvegarde } = await lib("sauvegarde.js");
const { mondayOf, decalerSemaine, jourQuebec, heureQuebec } = await lib("semaines.js");
const { villeDe, STATUTS_A_EFFECTUER } = await lib("rapports.js");

const fichier = process.argv.slice(2).find((a) => !a.startsWith("--") && a !== process.argv[process.argv.indexOf("--depuis") + 1]);
if (!fichier) {
  console.error('Usage : node scripts/comparer-rapports.mjs "<fichier .json.gz>" [--depuis AAAA-MM-JJ] [--detail]');
  process.exit(2);
}
const iDepuis = process.argv.indexOf("--depuis");
const depuis = new Date(`${iDepuis > 0 ? process.argv[iDepuis + 1] : "2026-09-01"}T00:00:00-04:00`);
const DETAIL = process.argv.includes("--detail");

const contenu = lireFichierSauvegarde(fs.readFileSync(path.resolve(RACINE, fichier)));
// Les dates sont stockées en UTC sans fuseau (timestamp sans zone) : on l'indique explicitement.
const utc = (v) => (v ? new Date(/(Z|[+-]\d\d:?\d\d)$/.test(v) ? v : `${v}Z`) : null);
const noms = new Map((contenu.tables.User || []).filter((u) => u.role === "DRIVER").map((u) => [u.id, u.name]));
const courses = (contenu.tables.Ride || []).filter((r) => r.driverId).map((r) => ({
  ...r, scheduledFor: utc(r.scheduledFor), createdAt: utc(r.createdAt), completedAt: utc(r.completedAt),
}));
const figes = (contenu.tables.WeeklyReport || []).map((w) => ({ ...w, weekStart: utc(w.weekStart) }));

const moment = (r) => r.scheduledFor || r.createdAt;
const semaineDe = (d) => mondayOf(d).toISOString();
const argent = (n) => `${(Math.round(n * 100) / 100).toFixed(2)} $`;
const somme = (liste) => liste.reduce((t, r) => ({ n: t.n + 1, total: t.total + r.fare, redevance: t.redevance + r.fare * (r.royaltyRate ?? 0.1) }), { n: 0, total: 0, redevance: 0 });

const cles = new Set();
for (const r of courses) {
  if (r.status === "COMPLETED" && r.completedAt) cles.add(`${r.driverId}|${semaineDe(r.completedAt)}`);
  if (moment(r)) cles.add(`${r.driverId}|${semaineDe(moment(r))}`);
}
for (const w of figes) cles.add(`${w.driverId}|${w.weekStart.toISOString()}`);

const lignes = [...cles]
  .map((c) => { const [driverId, debut] = c.split("|"); return { driverId, debut: new Date(debut) }; })
  .filter((x) => x.debut >= mondayOf(depuis))
  .sort((a, b) => (noms.get(a.driverId) || "").localeCompare(noms.get(b.driverId) || "") || a.debut - b.debut);

console.log(`Sauvegarde du ${contenu.creeLe} · semaines depuis le ${jourQuebec(mondayOf(depuis))}\n`);
for (const { driverId, debut } of lignes) {
  const fin = new Date(decalerSemaine(debut, 1).getTime() - 1);
  const dans = (d) => d && d >= debut && d <= fin;
  const ancien = somme(courses.filter((r) => r.driverId === driverId && r.status === "COMPLETED" && dans(r.completedAt)));
  const nouvellesCourses = courses.filter((r) => r.driverId === driverId && r.status === "COMPLETED" && dans(moment(r)));
  const nouveau = somme(nouvellesCourses);
  const aFaire = courses.filter((r) => r.driverId === driverId && STATUTS_A_EFFECTUER.includes(r.status) && dans(moment(r)));
  const fige = figes.find((w) => w.driverId === driverId && w.weekStart.getTime() === debut.getTime());
  const differe = ancien.n !== nouveau.n || Math.abs(ancien.total - nouveau.total) > 0.005;
  console.log(`${noms.get(driverId) || driverId} · semaine du ${jourQuebec(debut)} au ${jourQuebec(fin)}${differe ? "   ← les deux calculs diffèrent" : ""}`);
  console.log(`  récap figé reçu    : ${fige ? `${fige.rideCount} courses · ${argent(fige.totalFare)} · redevance ${argent(fige.royaltyDue)}` : "aucun"}`);
  console.log(`  ancien calcul      : ${ancien.n} courses · ${argent(ancien.total)} · redevance ${argent(ancien.redevance)}   (date de « Terminer »)`);
  console.log(`  nouveau calcul     : ${nouveau.n} courses · ${argent(nouveau.total)} · redevance ${argent(nouveau.redevance)}   (date de la course)`);
  if (aFaire.length) console.log(`  jamais terminées   : ${aFaire.length} course(s) de cette semaine ne sont pas « Effectuée » (${aFaire.map((r) => `${jourQuebec(moment(r))} ${r.status}`).join(", ")}) : à corriger dans la console`);
  if (DETAIL) {
    for (const r of [...nouvellesCourses, ...aFaire].sort((a, b) => moment(a) - moment(b))) {
      console.log(`    ${jourQuebec(moment(r))} ${heureQuebec(moment(r))} · ${villeDe(r.pickupAddress) || "?"} · ${argent(r.fare)} · ${r.status}${r.completedAt && !dans(r.completedAt) ? ` · terminée le ${jourQuebec(r.completedAt)}` : ""}`);
    }
  }
  console.log("");
}
process.exit(0);
