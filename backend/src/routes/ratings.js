import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// Notation bidirectionnelle en fin de course (chauffeur -> client et client -> chauffeur)
router.post("/:rideId", async (req, res) => {
  const { toUserId, stars, comment } = req.body;
  if (!toUserId || !stars) return res.status(400).json({ error: "toUserId et stars sont requis." });

  const rating = await prisma.rating.create({
    data: { rideId: req.params.rideId, fromUserId: req.user.id, toUserId, stars, comment },
  });

  // Recalcule la moyenne de l'utilisateur noté
  const agg = await prisma.rating.aggregate({ where: { toUserId }, _avg: { stars: true } });
  await prisma.user.update({ where: { id: toUserId }, data: { ratingAvg: agg._avg.stars ?? 5 } });

  res.status(201).json(rating);
});

export default router;
