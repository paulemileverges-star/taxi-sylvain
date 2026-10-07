import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { aPermission, estEquipe } from "../lib/equipe.js";

const router = Router();
router.use(requireAuth);

/** Date lue d'un paramètre, ou null si elle est illisible. */
function dateLisible(valeur) {
  const d = new Date(valeur);
  return typeof valeur === "string" && valeur && !Number.isNaN(d.getTime()) ? d : null;
}

// Cédule d'appel de la semaine (besoin #5) — Taxi Sylvain affecte des créneaux aux chauffeurs.
// Le dispatch voit toute la cédule ; un chauffeur ne voit que la sienne. Un client n'y a pas accès,
// et un administrateur seulement avec la permission « Cédule » (avant le 19 septembre 2026, tout
// compte connecté, client compris, pouvait lire la cédule de tous les chauffeurs).
router.get("/", async (req, res) => {
  const { role } = req.user;
  if (role === "CLIENT") return res.status(403).json({ error: "Accès refusé." });
  if (estEquipe(req.user) && !aPermission(req.user, "schedule")) {
    return res.status(403).json({ error: "Accès refusé : cette fonctionnalité n'est pas autorisée pour votre compte." });
  }
  const where = role === "DRIVER" ? { driverId: req.user.id } : {};
  const { from, to } = req.query;
  if (from || to) {
    const debut = from ? dateLisible(from) : null;
    const fin = to ? dateLisible(to) : null;
    if ((from && !debut) || (to && !fin)) return res.status(400).json({ error: "Période invalide." });
    where.startsAt = { ...(debut && { gte: debut }), ...(fin && { lte: fin }) };
  }

  const entries = await prisma.schedule.findMany({
    where,
    orderBy: { startsAt: "asc" },
    include: { driver: { select: { id: true, name: true } } },
  });
  res.json(entries);
});

// Audit du 7 octobre 2026 (B13) : une date illisible faisait une erreur 500, et un compte client
// pouvait être inscrit comme chauffeur de la cédule. Les deux sont désormais refusés clairement.
router.post("/", requirePermission("schedule"), async (req, res) => {
  const { driverId, label, startsAt } = req.body || {};
  if (!driverId || !label || !startsAt) {
    return res.status(400).json({ error: "driverId, label et startsAt sont requis." });
  }
  const debut = dateLisible(startsAt);
  if (!debut) return res.status(400).json({ error: "Date invalide." });
  if (typeof label !== "string" || !label.trim() || label.length > 200) return res.status(400).json({ error: "Libellé invalide." });
  const chauffeur = await prisma.user.findUnique({ where: { id: String(driverId) }, select: { role: true } });
  if (!chauffeur || chauffeur.role !== "DRIVER") return res.status(400).json({ error: "Chauffeur introuvable." });

  const entry = await prisma.schedule.create({
    data: { driverId: String(driverId), label: label.trim(), startsAt: debut },
    include: { driver: { select: { id: true, name: true } } },
  });
  res.status(201).json(entry);
});

router.delete("/:id", requirePermission("schedule"), async (req, res) => {
  const { count } = await prisma.schedule.deleteMany({ where: { id: String(req.params.id) } });
  if (!count) return res.status(404).json({ error: "Créneau introuvable." });
  res.status(204).end();
});

export default router;
