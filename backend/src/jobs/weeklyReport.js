import { prisma } from "../lib/prisma.js";
import { notifyUser } from "../lib/push.js";
import { FUSEAU_TAXI } from "../lib/ridesOrder.js";
import { isMailConfigured, sendMail } from "../lib/mailer.js";
import { realEmailOrNull } from "../lib/placeholderEmail.js";
import { previousWeekRange } from "../lib/semaines.js";
import { filtrePeriode, ligneCourse, totaux, STATUT_EFFECTUEE } from "../lib/rapports.js";
import { AUDIENCES, emettreEquipe } from "../lib/equipe.js";

// Récapitulatif hebdomadaire par chauffeur (besoin #14).
//
// La semaine va du lundi 00 h 00 au dimanche 23 h 59 min 59 s, HEURE DU QUÉBEC (lib/semaines.js).
// Depuis le 6 octobre 2026 (demandes du propriétaire) :
// - une course compte dans la semaine de sa DATE (prise en charge prévue), et non dans celle où le
//   chauffeur a appuyé sur « Terminer » (règle commune dans lib/rapports.js) ;
// - le récap part le lundi à 04 h 00 (heure de Montréal), par courriel et notification ;
// - UNE seule notification par chauffeur et par semaine (WeeklyReport.notifiedAt). Avant, chaque clic
//   sur « Générer le récap » dans la console renvoyait la notification : un chauffeur l'a reçue
//   quatre fois en vingt minutes.

// Fonctions de dates conservées ici pour les fichiers qui les importaient déjà.
export { minuitQuebec, mondayOf, previousWeekRange } from "../lib/semaines.js";

const DATE_LONGUE = new Intl.DateTimeFormat("fr-CA", { timeZone: FUSEAU_TAXI, day: "numeric", month: "long", year: "numeric" });
const DATE_COURTE = new Intl.DateTimeFormat("fr-CA", { timeZone: FUSEAU_TAXI, day: "numeric", month: "long" });

const echapper = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

/** Courriel de récap envoyé au chauffeur : mêmes chiffres que l'écran « Mes rapports », avec le détail des courses. */
export function messageRecap({ nom, weekStart, weekEnd, rideCount, totalFare, royaltyDue, courses = [], lienApp = process.env.DRIVER_APP_URL || "https://chauffeur.taxisylvain.ca" }) {
  const prenom = String(nom || "").trim().split(/\s+/)[0] || "";
  const bonjour = prenom ? `Bonjour ${prenom},` : "Bonjour,";
  const periode = `du ${DATE_COURTE.format(new Date(weekStart))} au ${DATE_LONGUE.format(new Date(weekEnd))}`;
  const nombre = `${rideCount} course${rideCount > 1 ? "s" : ""}`;
  const montant = (n) => `${Number(n || 0).toFixed(2)} $`;
  const subject = `Votre récapitulatif de la semaine ${periode} — Taxi Sylvain`;
  const ligne = (etiquette, valeur) =>
    `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px">${etiquette}</td><td style="padding:6px 0;text-align:right;color:#111827;font-size:14px;font-weight:600">${valeur}</td></tr>`;
  // Détail course par course (date, client, ville, montant) : le chauffeur peut comparer avec le
  // tableau de Taxi Sylvain sans ouvrir l'application.
  const detail = courses.length
    ? `<table style="width:100%;border-collapse:collapse;font-size:13px;color:#111827;margin-top:14px">
      <tr><th style="text-align:left;padding:4px 6px;color:#6b7280">Date</th><th style="text-align:left;padding:4px 6px;color:#6b7280">Client</th><th style="text-align:left;padding:4px 6px;color:#6b7280">Ville</th><th style="text-align:right;padding:4px 6px;color:#6b7280">Montant</th></tr>
      ${courses.map((c) => `<tr><td style="padding:4px 6px;border-top:1px solid #e5e7eb">${echapper(c.date)} ${echapper(c.heure)}</td><td style="padding:4px 6px;border-top:1px solid #e5e7eb">${echapper(c.client || "—")}</td><td style="padding:4px 6px;border-top:1px solid #e5e7eb">${echapper(c.ville || "—")}</td><td style="padding:4px 6px;border-top:1px solid #e5e7eb;text-align:right">${montant(c.montant)}</td></tr>`).join("\n      ")}
    </table>`
    : "";
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f3f4f6;font-family:Segoe UI,Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#16233a;color:#f5a623;padding:16px 20px;border-radius:12px 12px 0 0;font-size:18px;font-weight:700">Taxi Sylvain</div>
  <div style="background:#ffffff;padding:20px;border-radius:0 0 12px 12px">
    <p style="margin:0 0 12px;color:#111827;font-size:15px">${bonjour}</p>
    <p style="margin:0 0 12px;color:#111827;font-size:15px">Voici votre récapitulatif de la semaine ${periode}.</p>
    <table style="width:100%;border-collapse:collapse">
      ${ligne("Courses effectuées", nombre)}
      ${ligne("Total des courses", montant(totalFare))}
      ${ligne("Redevance Taxi Sylvain", montant(royaltyDue))}
    </table>
    ${detail}
    <p style="margin:16px 0 0;color:#6b7280;font-size:13px">Le détail est dans l'application, menu « Mes rapports » : <a href="${lienApp}" style="color:#16233a">${lienApp}</a></p>
  </div>
</div></body></html>`;
  const listeTexte = courses.length ? `\n\nDétail :\n${courses.map((c) => `- ${c.date} ${c.heure} · ${c.client || "—"} · ${c.ville || "—"} · ${montant(c.montant)}`).join("\n")}` : "";
  const text = `${bonjour}\n\nVoici votre récapitulatif de la semaine ${periode} :\n- Courses effectuées : ${nombre}\n- Total des courses : ${montant(totalFare)}\n- Redevance Taxi Sylvain : ${montant(royaltyDue)}${listeTexte}\n\nLe détail est dans l'application, menu « Mes rapports » : ${lienApp}`;
  return { subject, html, text };
}

/** Courriel de synthèse envoyé au Dispatch : une ligne par chauffeur, et les totaux. */
export function messageRecapDispatch({ weekStart, weekEnd, lignes }) {
  const periode = `du ${DATE_COURTE.format(new Date(weekStart))} au ${DATE_LONGUE.format(new Date(weekEnd))}`;
  const montant = (n) => `${Number(n || 0).toFixed(2)} $`;
  const totauxDispatch = (lignes || []).reduce((t, l) => ({ courses: t.courses + l.rideCount, total: t.total + l.totalFare, redevance: t.redevance + l.royaltyDue }), { courses: 0, total: 0, redevance: 0 });
  const rangees = (lignes || []).map((l) =>
    `<tr><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${echapper(l.name)}</td><td style="padding:6px 8px;text-align:right;border-bottom:1px solid #e5e7eb">${l.rideCount}</td><td style="padding:6px 8px;text-align:right;border-bottom:1px solid #e5e7eb">${montant(l.totalFare)}</td><td style="padding:6px 8px;text-align:right;border-bottom:1px solid #e5e7eb">${montant(l.royaltyDue)}</td></tr>`
  ).join("\n      ");
  const subject = `Récapitulatif hebdomadaire des chauffeurs, semaine ${periode}`;
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f3f4f6;font-family:Segoe UI,Helvetica,Arial,sans-serif">
<div style="max-width:640px;margin:0 auto;padding:24px">
  <div style="background:#16233a;color:#f5a623;padding:16px 20px;border-radius:12px 12px 0 0;font-size:18px;font-weight:700">Taxi Sylvain</div>
  <div style="background:#ffffff;padding:20px;border-radius:0 0 12px 12px">
    <p style="margin:0 0 12px;color:#111827;font-size:15px">Récapitulatif de la semaine ${periode} : ${totauxDispatch.courses} course${totauxDispatch.courses > 1 ? "s" : ""}, ${montant(totauxDispatch.total)} de courses, ${montant(totauxDispatch.redevance)} de redevance.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#111827">
      <tr><th style="text-align:left;padding:6px 8px;color:#6b7280">Chauffeur</th><th style="text-align:right;padding:6px 8px;color:#6b7280">Courses</th><th style="text-align:right;padding:6px 8px;color:#6b7280">Total</th><th style="text-align:right;padding:6px 8px;color:#6b7280">Redevance</th></tr>
      ${rangees || `<tr><td colspan="4" style="padding:6px 8px;color:#6b7280">Aucune course effectuée cette semaine.</td></tr>`}
    </table>
    <p style="margin:16px 0 0;color:#6b7280;font-size:13px">Le détail course par course, les exports PDF et Excel et les rapports par client sont dans la console, page Rapports.</p>
  </div>
</div></body></html>`;
  const text = `Récapitulatif de la semaine ${periode} : ${totauxDispatch.courses} course(s), ${montant(totauxDispatch.total)} de courses, ${montant(totauxDispatch.redevance)} de redevance.\n\n` +
    ((lignes || []).map((l) => `- ${l.name} : ${l.rideCount} course(s), ${montant(l.totalFare)}, redevance ${montant(l.royaltyDue)}`).join("\n") || "Aucune course effectuée cette semaine.") +
    "\n\nLe détail est dans la console, page Rapports.";
  return { subject, html, text };
}

async function courrielRecapDispatch({ weekStart, weekEnd, lignes }) {
  if (!isMailConfigured()) return;
  try {
    const dispatchs = await prisma.user.findMany({ where: { role: "DISPATCH" }, select: { name: true, email: true } });
    const message = messageRecapDispatch({ weekStart, weekEnd, lignes });
    for (const d of dispatchs) {
      const adresse = realEmailOrNull(d.email);
      if (adresse) await sendMail({ to: adresse, toName: d.name, ...message });
    }
  } catch (e) {
    console.error("Courriel de récap au Dispatch non envoyé :", e.message);
  }
}

async function courrielRecap(driver, report) {
  const adresse = realEmailOrNull(driver?.email);
  if (!adresse || !isMailConfigured()) return { ok: false, skipped: true };
  try {
    const { subject, html, text } = messageRecap({ nom: driver.name, ...report });
    return await sendMail({ to: adresse, toName: driver.name, subject, html, text });
  } catch (e) {
    console.error("Courriel de récap non envoyé :", e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Récap par chauffeur d'une semaine terminée : { driverId → { stats, courses } } à partir des
 * courses (date de la course dans la semaine, statut « Effectuée »).
 */
export function regrouperRecaps(rides) {
  const parChauffeur = {};
  for (const ride of rides) {
    if (!ride.driverId || ride.status !== STATUT_EFFECTUEE) continue;
    (parChauffeur[ride.driverId] ??= []).push(ligneCourse(ride));
  }
  return Object.fromEntries(Object.entries(parChauffeur).map(([driverId, lignes]) => {
    const t = totaux(lignes).effectuees;
    lignes.sort((a, b) => String(a.moment).localeCompare(String(b.moment)));
    return [driverId, { stats: { rideCount: t.nombre, totalFare: t.montant, royaltyDue: t.redevance }, courses: lignes }];
  }));
}

// Calcule (ou recalcule) le récap de la semaine pour chaque chauffeur et l'enregistre.
// « courriel » = génération automatique du lundi 04 h 00 : courriel et notification, UNE fois par
// chauffeur et par semaine. Une régénération manuelle depuis la console recalcule en silence.
// « synthese » : courriel de synthèse au Dispatch — « toujours » (lundi 04 h 00), « si-nouveaux »
// (reprise au démarrage ou relance horaire : seulement si un chauffeur vient d'être prévenu), ou
// « jamais ». Audit du 7 octobre 2026 (B16) : un récap dont aucun envoi n'a abouti (panne) n'est plus
// marqué « notifié » ; la relance horaire du lundi et le démarrage du serveur le retentent.
export async function generateWeeklyReports(io, range, { courriel = false, synthese = courriel ? "toujours" : "jamais" } = {}) {
  const { weekStart, weekEnd } = range || previousWeekRange();

  const rides = await prisma.ride.findMany({
    where: { driverId: { not: null }, status: STATUT_EFFECTUEE, ...filtrePeriode(weekStart, weekEnd) },
    include: { client: { select: { name: true } } },
  });
  const recaps = regrouperRecaps(rides);

  // Un chauffeur qui n'a plus aucune course effectuée cette semaine-là (course corrigée, réaffectée)
  // ne garde pas un ancien récap faux.
  await prisma.weeklyReport.deleteMany({ where: { weekStart, driverId: { notIn: Object.keys(recaps) } } });

  const results = [];
  let prevenus = 0;
  for (const [driverId, { stats, courses }] of Object.entries(recaps)) {
    const report = await prisma.weeklyReport.upsert({
      where: { driverId_weekStart: { driverId, weekStart } },
      update: { weekEnd, ...stats },
      create: { driverId, weekStart, weekEnd, ...stats },
      include: { driver: { select: { id: true, name: true, email: true } } },
    });
    results.push(report);
    if (!courriel || report.notifiedAt) continue;

    // Marqué AVANT l'envoi : même si deux générations se chevauchaient, une seule notifierait.
    const marque = await prisma.weeklyReport.updateMany({ where: { id: report.id, notifiedAt: null }, data: { notifiedAt: new Date() } });
    if (marque.count === 0) continue;
    if (io) io.to(`driver:${driverId}`).emit("report:ready", report);
    const push = await notifyUser(driverId, {
      title: "Votre récap de la semaine est prêt",
      body: `${stats.rideCount} course${stats.rideCount > 1 ? "s" : ""} · ${stats.totalFare.toFixed(2)} $ · redevance ${stats.royaltyDue.toFixed(2)} $`,
      data: { type: "report:ready" },
    });
    const mail = await courrielRecap(report.driver, { weekStart, weekEnd, ...stats, courses });
    const parvenu = (push?.envoyes || 0) > 0 || mail?.ok;
    const panne = push?.echec || Boolean(mail && !mail.ok && !mail.skipped);
    if (!parvenu && panne) {
      await prisma.weeklyReport.updateMany({ where: { id: report.id }, data: { notifiedAt: null } });
    } else {
      prevenus += 1;
    }
  }
  emettreEquipe(io, AUDIENCES.rapports, "report:generated", { weekStart, weekEnd, count: results.length });
  // Le Dispatch reçoit la synthèse de tous les chauffeurs, même une semaine sans course (pour
  // savoir que la tâche a bien tourné).
  if (synthese === "toujours" || (synthese === "si-nouveaux" && prevenus > 0)) {
    await courrielRecapDispatch({
      weekStart, weekEnd,
      lignes: results.map((r) => ({ name: r.driver?.name || r.driverId, rideCount: r.rideCount, totalFare: r.totalFare, royaltyDue: r.royaltyDue })),
    });
  }
  return results;
}
