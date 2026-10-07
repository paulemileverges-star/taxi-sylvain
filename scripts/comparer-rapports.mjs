#!/usr/bin/env node
// Contrôle des récaps hebdomadaires sur une COPIE de la base (fichier de sauvegarde), sur le PC,
// sans toucher à la production. Pour chaque chauffeur et chaque semaine, il compare :
// - le récap figé que les chauffeurs ont reçu (table WeeklyReport) ;
// - l'ancien calcul (avant le 6 octobre 2026) : courses comptées à la date où le chauffeur a appuyé
//   sur « Terminer » ;
// - le nouveau calcul : courses comptées à la date de la course (prise en charge prévue), ce
//   qu'affichent maintenant la console et l'application ;
// - les courses passées jamais « Effectuée » : leur heure était dépassée de plus de 12 h au moment
//   de la copie. Elles sont à vérifier avec le chauffeur avant d'être corrigées dans la console.
//   Les courses plus récentes sont en cours ou à venir : elles sont seulement comptées.
// Un bilan d'un écran termine la sortie. À comparer avec le tableau tenu par Taxi Sylvain.
// À lancer à la racine du dépôt :
//   node scripts/recuperer-sauvegarde.mjs            (copie fraîche dans OneDrive)
//   node scripts/comparer-rapports.mjs "<fichier .json.gz>" [--depuis 2026-09-01] [--detail] [--bilan]
// --detail liste les courses (date, heure, ville de départ, montant, statut), sans nom de client.
// --bilan n'affiche que le bilan.
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
  console.error('Usage : node scripts/comparer-rapports.mjs "<fichier .json.gz>" [--depuis AAAA-MM-JJ] [--detail] [--bilan]');
  process.exit(2);
}
const iDepuis = process.argv.indexOf("--depuis");
const depuis = new Date(`${iDepuis > 0 ? process.argv[iDepuis + 1] : "2026-09-01"}T00:00:00-04:00`);
const DETAIL = process.argv.includes("--detail");
const SEUL_BILAN = process.argv.includes("--bilan");

const contenu = lireFichierSauvegarde(fs.readFileSync(path.resolve(RACINE, fichier)));
// Les dates sont stockées en UTC sans fuseau (timestamp sans zone) : on l'indique explicitement.
const utc = (v) => (v ? new Date(/(Z|[+-]\d\d:?\d\d)$/.test(v) ? v : `${v}Z`) : null);
const noms = new Map((contenu.tables.User || []).filter((u) => u.role === "DRIVER").map((u) => [u.id, u.name]));
const courses = (contenu.tables.Ride || []).filter((r) => r.driverId).map((r) => ({
  ...r, scheduledFor: utc(r.scheduledFor), createdAt: utc(r.createdAt), completedAt: utc(r.completedAt),
}));
const figes = (contenu.tables.WeeklyReport || []).map((w) => ({ ...w, weekStart: utc(w.weekStart) }));

const moment = (r) => r.scheduledFor || r.createdAt;
// Une course n'est oubliée que si son heure était dépassée de plus de 12 h quand la copie a été faite :
// avant, elle peut être en cours ; après la copie, elle n'avait pas encore eu lieu.
const copieLe = new Date(contenu.creeLe);
const passee = (r) => moment(r).getTime() < copieLe.getTime() - 12 * 3600 * 1000;
const nonTerminee = (r) => STATUTS_A_EFFECTUER.includes(r.status);
const semaineDe = (d) => mondayOf(d).toISOString();
const argent = (n) => `${(Math.round(n * 100) / 100).toFixed(2)} $`;
const somme = (liste) => liste.reduce((t, r) => ({ n: t.n + 1, total: t.total + r.fare, redevance: t.redevance + r.fare * (r.royaltyRate ?? 0.1) }), { n: 0, total: 0, redevance: 0 });
const ecart = (a, b) => a.n !== b.n || Math.abs(a.total - b.total) > 0.005;
const court = (s) => `${s.n} · ${argent(s.total)}`;
const nom = (driverId) => noms.get(driverId) || driverId;
const ligneCourse = (r) => `${jourQuebec(moment(r))} ${heureQuebec(moment(r))} · ${villeDe(r.pickupAddress) || "?"} · ${argent(r.fare)} · ${r.status}`;
const debutPeriode = mondayOf(depuis);

const cles = new Set();
for (const r of courses) {
  if (r.status === "COMPLETED" && r.completedAt) cles.add(`${r.driverId}|${semaineDe(r.completedAt)}`);
  if (moment(r)) cles.add(`${r.driverId}|${semaineDe(moment(r))}`);
}
for (const w of figes) cles.add(`${w.driverId}|${w.weekStart.toISOString()}`);

const lignes = [...cles]
  .map((c) => { const [driverId, debut] = c.split("|"); return { driverId, debut: new Date(debut) }; })
  .filter((x) => x.debut >= debutPeriode)
  .sort((a, b) => nom(a.driverId).localeCompare(nom(b.driverId)) || a.debut - b.debut);

const aRevoir = [];
if (!SEUL_BILAN) console.log(`Copie de la base du ${jourQuebec(copieLe)} à ${heureQuebec(copieLe)} (heure de Montréal) · semaines depuis le ${jourQuebec(debutPeriode)}\n`);
for (const { driverId, debut } of lignes) {
  const fin = new Date(decalerSemaine(debut, 1).getTime() - 1);
  const dans = (d) => d && d >= debut && d <= fin;
  const siennes = courses.filter((r) => r.driverId === driverId);
  const ancien = somme(siennes.filter((r) => r.status === "COMPLETED" && dans(r.completedAt)));
  const effectuees = siennes.filter((r) => r.status === "COMPLETED" && dans(moment(r)));
  const nouveau = somme(effectuees);
  const oubliees = siennes.filter((r) => nonTerminee(r) && dans(moment(r)) && passee(r));
  const aVenir = siennes.filter((r) => nonTerminee(r) && dans(moment(r)) && !passee(r));
  const fige = figes.find((w) => w.driverId === driverId && w.weekStart.getTime() === debut.getTime());
  // Rien d'effectué, de reçu ni d'oublié (courses à venir ou annulées) : rien à contrôler.
  if (!ancien.n && !nouveau.n && !fige && !oubliees.length) continue;
  const recu = fige && { n: fige.rideCount, total: fige.totalFare };
  const differe = ecart(ancien, nouveau);
  if (differe || (recu && ecart(recu, nouveau))) aRevoir.push({ driverId, debut, fin, recu, ancien, nouveau });
  if (SEUL_BILAN) continue;
  console.log(`${nom(driverId)} · semaine du ${jourQuebec(debut)} au ${jourQuebec(fin)}${differe ? "   ← les deux calculs diffèrent" : ""}`);
  console.log(`  récap figé reçu    : ${fige ? `${fige.rideCount} courses · ${argent(fige.totalFare)} · redevance ${argent(fige.royaltyDue)}` : "aucun"}`);
  console.log(`  ancien calcul      : ${ancien.n} courses · ${argent(ancien.total)} · redevance ${argent(ancien.redevance)}   (date de « Terminer »)`);
  console.log(`  nouveau calcul     : ${nouveau.n} courses · ${argent(nouveau.total)} · redevance ${argent(nouveau.redevance)}   (date de la course)`);
  if (oubliees.length) console.log(`  jamais terminées   : ${oubliees.length} course(s) passée(s) sans « Effectuée » : à vérifier avec le chauffeur`);
  if (aVenir.length) console.log(`  en cours ou à venir : ${aVenir.length} course(s) au moment de la copie : rien à faire`);
  if (DETAIL) {
    for (const r of [...effectuees, ...oubliees, ...aVenir].sort((a, b) => moment(a) - moment(b))) {
      const note = r.completedAt && !dans(r.completedAt) ? ` · terminée le ${jourQuebec(r.completedAt)}`
        : oubliees.includes(r) ? " · jamais terminée" : aVenir.includes(r) ? " · en cours ou à venir" : "";
      console.log(`    ${ligneCourse(r)}${note}`);
    }
    for (const r of siennes.filter((x) => x.status === "COMPLETED" && dans(x.completedAt) && !dans(moment(x))).sort((a, b) => moment(a) - moment(b))) {
      console.log(`    ${ligneCourse(r)} · terminée le ${jourQuebec(r.completedAt)} : comptée ici par l'ancien calcul, dans la semaine du ${jourQuebec(mondayOf(moment(r)))} par le nouveau`);
    }
  }
  console.log("");
}

// Bilan d'un écran : ce qu'il faut regarder sans faire défiler la fenêtre.
const effectuees = courses.filter((r) => r.status === "COMPLETED");
const totalAncien = somme(effectuees.filter((r) => r.completedAt && r.completedAt >= debutPeriode));
const totalNouveau = somme(effectuees.filter((r) => moment(r) >= debutPeriode));
const oubliees = courses.filter((r) => nonTerminee(r) && passee(r) && moment(r) >= debutPeriode).sort((a, b) => moment(a) - moment(b));
const aVenir = courses.filter((r) => nonTerminee(r) && !passee(r)).length;
console.log("==================================== BILAN ====================================");
console.log(`Copie du ${jourQuebec(copieLe)} à ${heureQuebec(copieLe)} (heure de Montréal) · semaines depuis le ${jourQuebec(debutPeriode)}`);
console.log("reçu = récap envoyé au chauffeur · ancien = date de « Terminer » · nouveau = date de la course (console actuelle)");
console.log(`\nTotal effectué : ancien ${court(totalAncien)} · redevance ${argent(totalAncien.redevance)} | nouveau ${court(totalNouveau)} · redevance ${argent(totalNouveau.redevance)}`);
if (!ecart(totalAncien, totalNouveau)) {
  console.log("  identiques : aucune course perdue ni comptée deux fois, seules certaines changent de semaine");
} else {
  // Seules les courses à cheval sur le début de la période (ou sans heure de fin) expliquent un écart.
  for (const r of effectuees.filter((x) => x.completedAt && x.completedAt >= debutPeriode && moment(x) < debutPeriode)) {
    console.log(`  ancien seulement : ${ligneCourse(r)} · ${nom(r.driverId)} · course d'avant le ${jourQuebec(debutPeriode)}, terminée le ${jourQuebec(r.completedAt)}`);
  }
  for (const r of effectuees.filter((x) => moment(x) >= debutPeriode && !(x.completedAt && x.completedAt >= debutPeriode))) {
    console.log(`  nouveau seulement : ${ligneCourse(r)} · ${nom(r.driverId)} · ${r.completedAt ? `terminée le ${jourQuebec(r.completedAt)}` : "aucune heure de fin enregistrée"}`);
  }
}
console.log(`\nSemaines à revoir (reçu ou ancien différent du nouveau) : ${aRevoir.length}`);
for (const s of aRevoir) {
  console.log(`  ${nom(s.driverId)} · ${jourQuebec(s.debut)} au ${jourQuebec(s.fin)} : reçu ${s.recu ? court(s.recu) : "aucun"} | ancien ${court(s.ancien)} | nouveau ${court(s.nouveau)}`);
}
console.log(`\nCourses passées jamais « Effectuée » (à vérifier avec le chauffeur avant de corriger) : ${oubliees.length}`);
for (const r of oubliees) console.log(`  ${ligneCourse(r)} · ${nom(r.driverId)}`);
console.log(`\nCourses en cours ou à venir au moment de la copie : ${aVenir} (rien à faire)`);
process.exit(0);
