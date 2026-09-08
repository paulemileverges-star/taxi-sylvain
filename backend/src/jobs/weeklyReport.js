import { prisma } from "../lib/prisma.js";

function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day + 1);
  return d;
}

// Semaine calendaire précédente (lundi 00:00 -> dimanche 23:59:59.999), par défaut.
export function previousWeekRange(reference = new Date()) {
  const thisMonday = mondayOf(reference);
  const weekStart = new Date(thisMonday.getTime() - 7 * 86400000);
  const weekEnd = new Date(thisMonday.getTime() - 1);
  return { weekStart, weekEnd };
}

// Génère (ou régénère) le récap hebdomadaire par chauffeur pour la période donnée, et notifie
// chaque chauffeur + le dispatch en temps réel que leur récap est prêt (besoin #14).
export async function generateWeeklyReports(io, range) {
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
      include: { driver: { select: { id: true, name: true } } },
    });
    results.push(report);
    if (io) io.to(`driver:${driverId}`).emit("report:ready", report);
  }
  if (io && results.length > 0) {
    io.to("dispatch").emit("report:generated", { weekStart, weekEnd, count: results.length });
  }
  return results;
}
