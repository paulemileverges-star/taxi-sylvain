import { prisma } from "../lib/prisma.js";
import { notifyUser } from "../lib/push.js";
import { FUSEAU_TAXI } from "../lib/ridesOrder.js";
import { isMailConfigured, sendMail } from "../lib/mailer.js";
import { realEmailOrNull } from "../lib/placeholderEmail.js";

// Récapitulatif hebdomadaire par chauffeur (besoin #14).
//
// La semaine va du lundi 00 h 00 au dimanche 23 h 59 min 59 s, HEURE DU QUÉBEC. Avant le
// 20 septembre 2026, ces bornes étaient calculées à l'heure du serveur (UTC sur Railway) : une
// course terminée le dimanche à 22 h à Montréal (lundi 02 h UTC) tombait dans la semaine suivante,
// et le total remis au chauffeur ne correspondait pas à ce qu'il avait vécu.

const PARTIES = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSEAU_TAXI, hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

function partiesQuebec(date) {
  const p = Object.fromEntries(PARTIES.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, mi: Number(p.minute), s: Number(p.second) };
}

/** Écart, en minutes, entre l'heure du Québec et UTC à cet instant (négatif : Québec en retard). */
function decalageMinutes(date) {
  const { y, m, d, h, mi, s } = partiesQuebec(date);
  return (Date.UTC(y, m - 1, d, h, mi, s) - date.getTime()) / 60000;
}

/** L'instant exact de minuit, heure du Québec, pour une date civile (année, mois 1-12, jour). */
export function minuitQuebec(y, m, d) {
  const naif = Date.UTC(y, m - 1, d, 0, 0, 0);
  let resultat = new Date(naif - decalageMinutes(new Date(naif)) * 60000);
  // Si un changement d'heure sépare l'estimation du résultat, un second calcul suffit.
  resultat = new Date(naif - decalageMinutes(resultat) * 60000);
  return resultat;
}

/** Lundi 00 h 00, heure du Québec, de la semaine qui contient cette date. */
export function mondayOf(date) {
  const { y, m, d } = partiesQuebec(new Date(date));
  const civil = new Date(Date.UTC(y, m - 1, d));
  const jour = civil.getUTCDay() || 7; // lundi = 1 … dimanche = 7
  civil.setUTCDate(civil.getUTCDate() - jour + 1);
  return minuitQuebec(civil.getUTCFullYear(), civil.getUTCMonth() + 1, civil.getUTCDate());
}

// Semaine calendaire précédente (lundi 00:00 -> dimanche 23:59:59.999), par défaut.
export function previousWeekRange(reference = new Date()) {
  const thisMonday = mondayOf(reference);
  // Le lundi précédent se cherche sur le calendrier, pas en retirant 7 × 24 h : un changement
  // d'heure dans la semaine ferait sinon commencer le récap à 23 h ou à 1 h.
  const weekStart = mondayOf(new Date(thisMonday.getTime() - 3 * 86400000));
  const weekEnd = new Date(thisMonday.getTime() - 1);
  return { weekStart, weekEnd };
}

const DATE_LONGUE = new Intl.DateTimeFormat("fr-CA", { timeZone: FUSEAU_TAXI, day: "numeric", month: "long", year: "numeric" });
const DATE_COURTE = new Intl.DateTimeFormat("fr-CA", { timeZone: FUSEAU_TAXI, day: "numeric", month: "long" });

/** Courriel de récap envoyé au chauffeur : mêmes chiffres que l'écran « Mes rapports ». */
export function messageRecap({ nom, weekStart, weekEnd, rideCount, totalFare, royaltyDue, lienApp = process.env.DRIVER_APP_URL || "https://chauffeur.taxisylvain.ca" }) {
  const prenom = String(nom || "").trim().split(/\s+/)[0] || "";
  const bonjour = prenom ? `Bonjour ${prenom},` : "Bonjour,";
  const periode = `du ${DATE_COURTE.format(new Date(weekStart))} au ${DATE_LONGUE.format(new Date(weekEnd))}`;
  const courses = `${rideCount} course${rideCount > 1 ? "s" : ""}`;
  const montant = (n) => `${Number(n || 0).toFixed(2)} $`;
  const subject = `Votre récapitulatif de la semaine ${periode} — Taxi Sylvain`;
  const ligne = (etiquette, valeur) =>
    `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px">${etiquette}</td><td style="padding:6px 0;text-align:right;color:#111827;font-size:14px;font-weight:600">${valeur}</td></tr>`;
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f3f4f6;font-family:Segoe UI,Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#16233a;color:#f5a623;padding:16px 20px;border-radius:12px 12px 0 0;font-size:18px;font-weight:700">Taxi Sylvain</div>
  <div style="background:#ffffff;padding:20px;border-radius:0 0 12px 12px">
    <p style="margin:0 0 12px;color:#111827;font-size:15px">${bonjour}</p>
    <p style="margin:0 0 12px;color:#111827;font-size:15px">Voici votre récapitulatif de la semaine ${periode}.</p>
    <table style="width:100%;border-collapse:collapse">
      ${ligne("Courses effectuées", courses)}
      ${ligne("Total des courses", montant(totalFare))}
      ${ligne("Redevance Taxi Sylvain", montant(royaltyDue))}
    </table>
    <p style="margin:16px 0 0;color:#6b7280;font-size:13px">Le détail est dans l'application, menu « Mes rapports » : <a href="${lienApp}" style="color:#16233a">${lienApp}</a></p>
  </div>
</div></body></html>`;
  const text = `${bonjour}\n\nVoici votre récapitulatif de la semaine ${periode} :\n- Courses effectuées : ${courses}\n- Total des courses : ${montant(totalFare)}\n- Redevance Taxi Sylvain : ${montant(royaltyDue)}\n\nLe détail est dans l'application, menu « Mes rapports » : ${lienApp}`;
  return { subject, html, text };
}

async function courrielRecap(driver, report) {
  const adresse = realEmailOrNull(driver?.email);
  if (!adresse || !isMailConfigured()) return;
  try {
    const { subject, html, text } = messageRecap({ nom: driver.name, ...report });
    await sendMail({ to: adresse, toName: driver.name, subject, html, text });
  } catch (e) {
    console.error("Courriel de récap non envoyé :", e.message);
  }
}

// Génère (ou régénère) le récap hebdomadaire par chauffeur pour la période donnée, et notifie
// chaque chauffeur + le dispatch en temps réel que leur récap est prêt (besoin #14).
// « courriel » : seule la génération automatique du lundi envoie le courriel ; une régénération
// manuelle depuis la console ne doit pas inonder les chauffeurs.
export async function generateWeeklyReports(io, range, { courriel = false } = {}) {
  const { weekStart, weekEnd } = range || previousWeekRange();

  const rides = await prisma.ride.findMany({
    where: { status: "COMPLETED", completedAt: { gte: weekStart, lte: weekEnd }, driverId: { not: null } },
  });

  const byDriver = {};
  for (const ride of rides) {
    byDriver[ride.driverId] ??= { rideCount: 0, totalFare: 0, royaltyDue: 0 };
    byDriver[ride.driverId].rideCount += 1;
    byDriver[ride.driverId].totalFare += ride.fare;
    byDriver[ride.driverId].royaltyDue += ride.fare * ride.royaltyRate;
  }

  const results = [];
  for (const [driverId, stats] of Object.entries(byDriver)) {
    const report = await prisma.weeklyReport.upsert({
      where: { driverId_weekStart: { driverId, weekStart } },
      update: { weekEnd, ...stats },
      create: { driverId, weekStart, weekEnd, ...stats },
      include: { driver: { select: { id: true, name: true, email: true } } },
    });
    results.push(report);
    if (io) io.to(`driver:${driverId}`).emit("report:ready", report);
    notifyUser(driverId, {
      title: "Votre récap de la semaine est prêt",
      body: `${stats.rideCount} course${stats.rideCount > 1 ? "s" : ""} · ${stats.totalFare.toFixed(2)} $ · redevance ${stats.royaltyDue.toFixed(2)} $`,
      data: { type: "report:ready" },
    });
    if (courriel) await courrielRecap(report.driver, { weekStart, weekEnd, ...stats });
  }
  if (io && results.length > 0) {
    io.to("dispatch").emit("report:generated", { weekStart, weekEnd, count: results.length });
  }
  return results;
}
