import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { quote } from "../lib/pricing.js";

const router = Router();
router.use(requireAuth);

// Tarif applicable à une course : municipalité reconnue dans l'adresse de départ x destination.
router.post("/quote", async (req, res) => {
  const { pickupAddress, destinationCode } = req.body;
  const result = await quote({ pickupAddress, destinationCode });
  res.json({ price: result.price, zoneName: result.zoneName, destinationLabel: result.destination?.label || null });
});

function parsePrice(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

// Grille tarifaire (page Tarifs du Dispatch)
router.get("/zones", async (req, res) => {
  res.json(await prisma.priceZone.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }));
});

router.post("/zones", requirePermission("courses"), async (req, res) => {
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Nom de la municipalité requis." });
  const existing = await prisma.priceZone.findUnique({ where: { name } });
  if (existing) return res.status(409).json({ error: "Cette municipalité existe déjà." });
  const last = await prisma.priceZone.aggregate({ _max: { sortOrder: true } });
  const zone = await prisma.priceZone.create({
    data: { name, priceYUL: parsePrice(req.body.priceYUL), priceYHU: parsePrice(req.body.priceYHU), sortOrder: (last._max.sortOrder || 0) + 1 },
  });
  res.status(201).json(zone);
});

router.put("/zones/:id", requirePermission("courses"), async (req, res) => {
  const data = {};
  if (req.body.name !== undefined) data.name = String(req.body.name).trim();
  if (req.body.priceYUL !== undefined) data.priceYUL = parsePrice(req.body.priceYUL);
  if (req.body.priceYHU !== undefined) data.priceYHU = parsePrice(req.body.priceYHU);
  try {
    res.json(await prisma.priceZone.update({ where: { id: req.params.id }, data }));
  } catch {
    res.status(404).json({ error: "Municipalité introuvable." });
  }
});

router.delete("/zones/:id", requirePermission("courses"), async (req, res) => {
  try {
    await prisma.priceZone.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: "Municipalité introuvable." });
  }
});

export default router;
