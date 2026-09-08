import { Router } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { generateWeeklyReports, previousWeekRange } from "../jobs/weeklyReport.js";
import { streamReportPdf, streamReportXlsx } from "../lib/exportReport.js";

const router = Router();

// Accepte le token soit dans l'en-tête Authorization, soit en query (?token=...) — nécessaire
// pour un lien de téléchargement direct (ex. ouvert depuis l'app Chauffeur via Linking.openURL).
function authFromHeaderOrQuery(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : req.query.token;
  if (!token) return res.status(401).json({ error: "Authentification requise." });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Session invalide ou expirée." });
  }
}

router.use((req, res, next) => (req.path === "/export" ? authFromHeaderOrQuery(req, res, next) : requireAuth(req, res, next)));

// Récapitulatif en direct pour une période donnée (besoin #14) — vue Dispatch
router.get("/weekly", requireRole("DISPATCH"), async (req, res) => {
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
  for (const ride of rides) {
    if (!ride.driverId) continue;
    byDriver[ride.driverId] ??= { driver: ride.driver, rideCount: 0, totalFare: 0, royaltyDue: 0 };
    byDriver[ride.driverId].rideCount += 1;
    byDriver[ride.driverId].totalFare += ride.fare;
    byDriver[ride.driverId].royaltyDue += ride.fare * ride.royaltyRate;
  }

  res.json({ range, byDriver: Object.values(byDriver) });
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
router.post("/generate", requireRole("DISPATCH"), async (req, res) => {
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
