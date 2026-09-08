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
    select: { id: true, name: true, email: true, phone: true, ratingAvg: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(clients);
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
