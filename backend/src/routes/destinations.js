import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// Liste des destinations prédéfinies (YUL, YHU, REM...) avec leur tarif — lue par le Dispatch et
// par les clients au moment de réserver.
router.get("/", async (req, res) => {
  const destinations = await prisma.destination.findMany({ orderBy: { sortOrder: "asc" } });
  res.json(destinations);
});

// Le Dispatch tient à jour l'adresse et le tarif de chaque destination (page Tarifs).
router.put("/:code", requirePermission("courses"), async (req, res) => {
  const { label, address, lat, lng, price } = req.body;
  const data = {};
  if (label !== undefined) data.label = String(label).trim();
  if (address !== undefined) data.address = String(address).trim();
  if (lat !== undefined) data.lat = typeof lat === "number" ? lat : null;
  if (lng !== undefined) data.lng = typeof lng === "number" ? lng : null;
  if (price !== undefined) {
    const n = Number(price);
    data.price = price === null || price === "" || !Number.isFinite(n) || n <= 0 ? null : Math.round(n * 100) / 100;
  }
  try {
    const destination = await prisma.destination.update({ where: { code: req.params.code }, data });
    res.json(destination);
  } catch {
    res.status(404).json({ error: "Destination introuvable." });
  }
});

export default router;
