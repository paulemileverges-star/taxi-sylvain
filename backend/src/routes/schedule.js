import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// Cédule d'appel de la semaine (besoin #5) — Taxi Sylvain affecte des créneaux aux chauffeurs.
// Le dispatch voit toute la cédule ; un chauffeur ne voit que la sienne. Un client n'y a pas accès,
// et un administrateur seulement avec la permission « Cédule » (avant le 19 septembre 2026, tout
// compte connecté, client compris, pouvait lire la cédule de tous les chauffeurs).
router.get("/", async (req, res) => {
  const { role } = req.user;
  if (role === "CLIENT") return res.status(403).json({ error: "Accès refusé." });
  if (role === "ADMIN" && !req.user.permissions?.includes("schedule")) {
    return res.status(403).json({ error: "Accès refusé : cette fonctionnalité n'est pas autorisée pour votre compte." });
  }
  const where = role === "DRIVER" ? { driverId: req.user.id } : {};
  const { from, to } = req.query;
  if (from || to) {
    where.startsAt = {
      ...(from && { gte: new Date(from) }),
      ...(to && { lte: new Date(to) }),
    };
  }

  const entries = await prisma.schedule.findMany({
    where,
    orderBy: { startsAt: "asc" },
    include: { driver: { select: { id: true, name: true } } },
  });
  res.json(entries);
});

router.post("/", requirePermission("schedule"), async (req, res) => {
  const { driverId, label, startsAt } = req.body;
  if (!driverId || !label || !startsAt) {
    return res.status(400).json({ error: "driverId, label et startsAt sont requis." });
  }

  const entry = await prisma.schedule.create({
    data: { driverId, label, startsAt: new Date(startsAt) },
    include: { driver: { select: { id: true, name: true } } },
  });
  res.status(201).json(entry);
});

router.delete("/:id", requirePermission("schedule"), async (req, res) => {
  await prisma.schedule.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export default router;
