import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { deleteUserCascade } from "../lib/deleteUser.js";

const router = Router();
router.use(requireAuth);
router.use(requireRole("DISPATCH"));

router.get("/", async (req, res) => {
  const clients = await prisma.user.findMany({
    where: { role: "CLIENT" },
    select: { id: true, name: true, email: true, phone: true, ratingAvg: true, createdAt: true, notes: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(clients);
});

// Mémo et préférences du Dispatch sur un client — jamais exposé au client lui-même.
router.patch("/:id/notes", async (req, res) => {
  const { notes } = req.body;
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.role !== "CLIENT") return res.status(404).json({ error: "Client introuvable." });

  const client = await prisma.user.update({
    where: { id: req.params.id },
    data: { notes: notes ?? null },
    select: { id: true, notes: true },
  });
  res.json(client);
});

router.delete("/:id", async (req, res) => {
  try {
    await deleteUserCascade(req.params.id);
    res.status(204).end();
  } catch (e) {
    res.status(404).json({ error: "Client introuvable." });
  }
});

export default router;
