import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { coursesANoter, DELAI_NOTATION_JOURS } from "../lib/notation.js";

const router = Router();
router.use(requireAuth);

// Courses terminées que la personne n'a pas encore notées (voir lib/notation.js) : l'application
// propose la notation à l'ouverture, même si la fin de course a été manquée (app fermée).
router.get("/pending", async (req, res) => {
  const moi = req.user.id;
  const depuis = new Date(Date.now() - DELAI_NOTATION_JOURS * 86400000);
  const rides = await prisma.ride.findMany({
    where: { status: "COMPLETED", completedAt: { gte: depuis }, OR: [{ clientId: moi }, { driverId: moi }] },
    include: {
      ratings: { select: { fromUserId: true } },
      client: { select: { id: true, name: true } },
      driver: { select: { id: true, name: true, carModel: true, plate: true, ratingAvg: true, photoUrl: true, carPhotoUrl: true } },
    },
  });
  res.json(coursesANoter(rides, moi));
});

// Notation bidirectionnelle en fin de course (chauffeur -> client et client -> chauffeur).
// Seules les deux parties de la course peuvent noter, uniquement l'autre partie, une seule fois,
// et seulement une fois la course terminée — sinon n'importe qui pourrait manipuler les moyennes.
router.post("/:rideId", async (req, res) => {
  const { toUserId, comment } = req.body;
  const stars = Number(req.body.stars);
  if (!toUserId || !Number.isInteger(stars) || stars < 1 || stars > 5) {
    return res.status(400).json({ error: "toUserId et une note entière de 1 à 5 sont requis." });
  }

  const ride = await prisma.ride.findUnique({ where: { id: req.params.rideId } });
  if (!ride) return res.status(404).json({ error: "Course introuvable." });
  if (ride.status !== "COMPLETED") return res.status(400).json({ error: "La course n'est pas encore terminée." });

  const isClient = req.user.id === ride.clientId;
  const isDriver = req.user.id === ride.driverId;
  if (!isClient && !isDriver) return res.status(403).json({ error: "Accès refusé." });
  const expectedTarget = isClient ? ride.driverId : ride.clientId;
  if (!expectedTarget || toUserId !== expectedTarget) {
    return res.status(400).json({ error: "Vous ne pouvez noter que l'autre partie de cette course." });
  }

  const already = await prisma.rating.findFirst({ where: { rideId: ride.id, fromUserId: req.user.id } });
  if (already) return res.status(409).json({ error: "Vous avez déjà noté cette course." });

  const rating = await prisma.rating.create({
    data: { rideId: ride.id, fromUserId: req.user.id, toUserId, stars, comment: comment?.trim() || null },
  });

  const agg = await prisma.rating.aggregate({ where: { toUserId }, _avg: { stars: true } });
  await prisma.user.update({ where: { id: toUserId }, data: { ratingAvg: agg._avg.stars ?? 5 } });

  res.status(201).json(rating);
});

export default router;
