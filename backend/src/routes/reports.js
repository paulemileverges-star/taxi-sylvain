import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, requirePermission } from "../middleware/auth.js";
import { generateWeeklyReports, previousWeekRange, mondayOf } from "../jobs/weeklyReport.js";
import { streamReportPdf, streamReportXlsx } from "../lib/exportReport.js";

const router = Router();

// Accepte le token soit dans l'en-tête Authorization, soit en query (?token=...) — nécessaire
// pour un lien de téléchargement direct (ex. ouvert depuis l'app Chauffeur via Linking.openURL).
function authFromHeaderOrQuery(req, res, next) {
  // Même contrôle que partout ailleurs (compte encore existant, rôle à jour) : le jeton passé dans
  // l'adresse est simplement recopié dans l'en-tête avant l'appel à requireAuth.
  if (!req.headers.authorization && typeof req.query.token === "string") {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  return requireAuth(req, res, next);
}

router.use((req, res, next) => (req.path === "/export" ? authFromHeaderOrQuery(req, res, next) : requireAuth(req, res, next)));

// Récapitulatif en direct pour une période donnée (besoin #14) — vue Dispatch
router.get("/weekly", requirePermission("reports"), async (req, res) => {
  const { from, to } = req.query;
  const range = {
    gte: from ? new Date(from) : previousWeekRange().weekStart,
    lte: to ? new Date(to) : new Date(),
  };

  const rides = await prisma.ride.findMany({
    where: { status: "COMPLETED", completedAt: range },
    include: { driver: { select: { id: true, name: true } }, client: { select: { id: true, name: true } } },
  });

  const byDriver = {};
  const byClient = {};
  for (const ride of rides) {
    if (ride.driverId) {
      byDriver[ride.driverId] ??= { driver: ride.driver, rideCount: 0, totalFare: 0, royaltyDue: 0 };
      byDriver[ride.driverId].rideCount += 1;
      byDriver[ride.driverId].totalFare += ride.fare;
      byDriver[ride.driverId].royaltyDue += ride.fare * ride.royaltyRate;
    }
    // Récap par client (cahier des charges : « par chauffeur ou encore par client »)
    const clientKey = ride.clientId || "__none__";
    byClient[clientKey] ??= { client: ride.client || { id: null, name: "Client non spécifié" }, rideCount: 0, totalFare: 0 };
    byClient[clientKey].rideCount += 1;
    byClient[clientKey].totalFare += ride.fare;
  }

  res.json({ range, byDriver: Object.values(byDriver), byClient: Object.values(byClient) });
});

// Revenus de la semaine en cours pour le chauffeur connecté — "Mes revenus". Calculé en direct
// (contrairement à /mine, qui liste les récaps hebdomadaires figés des semaines précédentes),
// pour qu'un chauffeur qui vient de se créer un compte voie bien 0 $ tant qu'il n'a rien fait.
router.get("/my-earnings", requireRole("DRIVER"), async (req, res) => {
  const weekStart = mondayOf(new Date());
  const rides = await prisma.ride.findMany({
    where: { driverId: req.user.id, status: "COMPLETED", completedAt: { gte: weekStart } },
  });
  const totalFare = rides.reduce((sum, r) => sum + r.fare, 0);
  const royaltyDue = rides.reduce((sum, r) => sum + r.fare * r.royaltyRate, 0);
  res.json({ weekStart, rideCount: rides.length, totalFare, royaltyDue });
});

// Historique des récaps hebdomadaires figés du chauffeur connecté — "Mes rapports" (besoin #14)
router.get("/mine", requireRole("DRIVER"), async (req, res) => {
  const reports = await prisma.weeklyReport.findMany({
    where: { driverId: req.user.id },
    orderBy: { weekStart: "desc" },
  });
  res.json(reports);
});

// Déclenche manuellement la génération du récap (normalement automatique, voir cron dans index.js)
router.post("/generate", requirePermission("reports"), async (req, res) => {
  const { from, to } = req.body;
  const range = from && to ? { weekStart: new Date(from), weekEnd: new Date(to) } : previousWeekRange();
  const io = req.app.get("io");
  const results = await generateWeeklyReports(io, range);
  res.status(201).json({ range, count: results.length });
});

// Export PDF/Excel du récap — Dispatch (tous les chauffeurs) ou Chauffeur (le sien uniquement)
router.get("/export", async (req, res) => {
  const format = req.query.format === "xlsx" ? "xlsx" : "pdf";
  const { from, to } = req.query;
  const range = from && to
    ? { weekStart: new Date(from), weekEnd: new Date(to) }
    : previousWeekRange();

  const where = {
    status: "COMPLETED",
    completedAt: { gte: range.weekStart, lte: range.weekEnd },
    driverId: { not: null },
    ...(req.user.role === "DRIVER" ? { driverId: req.user.id } : {}),
  };
  if (req.user.role === "CLIENT") return res.status(403).json({ error: "Accès refusé." });
  if (req.user.role === "ADMIN" && !req.user.permissions?.includes("reports")) {
    return res.status(403).json({ error: "Accès refusé : cette fonctionnalité n'est pas autorisée pour votre compte." });
  }

  const rides = await prisma.ride.findMany({ where, include: { driver: { select: { id: true, name: true } } } });

  const byDriver = {};
  for (const ride of rides) {
    byDriver[ride.driverId] ??= { driverName: ride.driver.name, rideCount: 0, totalFare: 0, royaltyDue: 0 };
    byDriver[ride.driverId].rideCount += 1;
    byDriver[ride.driverId].totalFare += ride.fare;
    byDriver[ride.driverId].royaltyDue += ride.fare * ride.royaltyRate;
  }
  const rows = Object.values(byDriver);

  if (format === "xlsx") {
    await streamReportXlsx(res, { weekStart: range.weekStart, weekEnd: range.weekEnd, rows });
  } else {
    streamReportPdf(res, { weekStart: range.weekStart, weekEnd: range.weekEnd, rows });
  }
});

export default router;
