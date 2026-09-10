import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { notifyUser } from "../lib/push.js";

const router = Router();
router.use(requireAuth);

// Messagerie interne — deux types de fils de discussion, jamais de numéro de téléphone transmis
// (voir docs/ARCHITECTURE.md §3 pour le masquage d'appel vocal réel via Twilio Proxy si besoin) :
// - liée à une course (chauffeur<->client), routes /:rideId ci-dessous (besoin #3)
// - directe dispatch<->chauffeur, hors course, routes /direct/:driverId ci-dessous (besoin #4)

// Fil direct dispatch<->chauffeur, identifié par l'id du chauffeur peu importe qui écrit.
router.get("/direct/:driverId", async (req, res) => {
  const { driverId } = req.params;
  if (req.user.role === "DRIVER" && req.user.id !== driverId) {
    return res.status(403).json({ error: "Accès refusé." });
  }
  if (req.user.role === "CLIENT") return res.status(403).json({ error: "Accès refusé." });

  const messages = await prisma.message.findMany({
    where: { driverId },
    orderBy: { createdAt: "asc" },
    include: {
      sender: { select: { id: true, name: true, role: true } },
      ride: { select: { id: true, pickupAddress: true, destAddress: true } },
    },
  });
  res.json(messages);
});

router.post("/direct/:driverId", async (req, res) => {
  const { driverId } = req.params;
  const { text, rideId } = req.body;
  if (req.user.role === "DRIVER" && req.user.id !== driverId) {
    return res.status(403).json({ error: "Accès refusé." });
  }
  if (req.user.role === "CLIENT") return res.status(403).json({ error: "Accès refusé." });
  if (!text || !text.trim()) return res.status(400).json({ error: "Message vide." });

  // Un chauffeur peut écrire "à propos" d'une course précise (bouton dans l'écran de course) —
  // on associe le message à cette course pour que le Dispatch puisse l'ouvrir en un clic.
  const message = await prisma.message.create({
    data: { driverId, senderId: req.user.id, text, rideId: rideId || null },
    include: {
      sender: { select: { id: true, name: true, role: true } },
      ride: { select: { id: true, pickupAddress: true, destAddress: true } },
    },
  });

  const io = req.app.get("io");
  if (io) {
    io.to(`driver:${driverId}`).emit("message:direct", message);
    io.to("dispatch").emit("message:direct", message);
  }
  if (req.user.role === "DISPATCH") {
    notifyUser(driverId, { title: "Message de Taxi Sylvain", body: text, data: { type: "message:direct" } });
  }
  res.status(201).json(message);
});

async function requireRideParty(req, res, next) {
  const ride = await prisma.ride.findUnique({ where: { id: req.params.rideId } });
  if (!ride) return res.status(404).json({ error: "Course introuvable." });
  const isParty = req.user.role === "DISPATCH" || req.user.id === ride.clientId || req.user.id === ride.driverId;
  if (!isParty) return res.status(403).json({ error: "Accès refusé." });
  req.ride = ride;
  next();
}

router.get("/:rideId", requireRideParty, async (req, res) => {
  const messages = await prisma.message.findMany({
    where: { rideId: req.params.rideId },
    orderBy: { createdAt: "asc" },
    include: { sender: { select: { id: true, name: true, role: true } } },
  });
  res.json(messages);
});

router.post("/:rideId", requireRideParty, async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "Message vide." });

  const message = await prisma.message.create({
    data: { rideId: req.params.rideId, senderId: req.user.id, text },
    include: { sender: { select: { id: true, name: true, role: true } } },
  });

  const io = req.app.get("io");
  if (io) io.to(`ride:${req.params.rideId}`).emit("message:new", message);

  const otherPartyId = req.user.id === req.ride.clientId ? req.ride.driverId : req.ride.clientId;
  if (otherPartyId && req.user.role !== "DISPATCH") {
    notifyUser(otherPartyId, { title: `Message de ${req.user.name}`, body: text, data: { type: "message:ride", rideId: req.params.rideId } });
  }
  res.status(201).json(message);
});

export default router;
