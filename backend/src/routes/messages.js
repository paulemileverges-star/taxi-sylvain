import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { notifyUser } from "../lib/push.js";
import { personalRoom } from "../lib/rooms.js";

const router = Router();
router.use(requireAuth);

const ACTIVE_RIDE_STATUSES = ["REQUESTED", "BROADCAST", "ACCEPTED", "EN_ROUTE", "STARTED"];

async function readMarkers(userId) {
  const rows = await prisma.readMarker.findMany({ where: { userId } });
  return new Map(rows.map((r) => [r.threadKey, r.readAt]));
}
const EPOCH = new Date(0);

// Messages non lus de l'utilisateur connecté, par fil — pour les badges des menus et des listes.
// Un message compte comme non lu s'il vient de quelqu'un d'autre et qu'il est postérieur à la
// dernière ouverture du fil (POST /messages/read).
router.get("/unread", async (req, res) => {
  const me = req.user.id;
  const marks = await readMarkers(me);
  const after = (key) => marks.get(key) || EPOCH;
  const isStaff = req.user.role === "DISPATCH" || req.user.role === "ADMIN";

  // Fils directs dispatch<->chauffeur
  const direct = { total: 0, byDriver: {} };
  if (req.user.role === "DRIVER") {
    const n = await prisma.message.count({ where: { driverId: me, senderId: { not: me }, createdAt: { gt: after(`direct:${me}`) } } });
    direct.total = n;
    if (n) direct.byDriver[me] = n;
  } else if (isStaff) {
    const drivers = await prisma.user.findMany({ where: { role: "DRIVER" }, select: { id: true } });
    for (const d of drivers) {
      const n = await prisma.message.count({ where: { driverId: d.id, senderId: d.id, createdAt: { gt: after(`direct:${d.id}`) } } });
      if (n) { direct.byDriver[d.id] = n; direct.total += n; }
    }
  }

  // Groupes de discussion
  const groups = { total: 0, byConversation: {} };
  const memberships = await prisma.conversationParticipant.findMany({ where: { userId: me }, select: { conversationId: true } });
  for (const m of memberships) {
    const n = await prisma.groupMessage.count({ where: { conversationId: m.conversationId, senderId: { not: me }, createdAt: { gt: after(`group:${m.conversationId}`) } } });
    if (n) { groups.byConversation[m.conversationId] = n; groups.total += n; }
  }

  // Discussions de course (chauffeur<->client), courses en cours seulement
  const rides = { total: 0, byRide: {} };
  if (req.user.role === "DRIVER" || req.user.role === "CLIENT") {
    const where = req.user.role === "DRIVER" ? { driverId: me } : { clientId: me };
    const active = await prisma.ride.findMany({ where: { ...where, status: { in: ACTIVE_RIDE_STATUSES } }, select: { id: true } });
    for (const r of active) {
      const n = await prisma.message.count({ where: { rideId: r.id, driverId: null, senderId: { not: me }, createdAt: { gt: after(`ride:${r.id}`) } } });
      if (n) { rides.byRide[r.id] = n; rides.total += n; }
    }
  }

  res.json({ direct, groups, rides, total: direct.total + groups.total + rides.total });
});

// Marque un fil comme lu (appelé à l'ouverture du fil et à chaque message reçu pendant qu'il est ouvert).
router.post("/read", async (req, res) => {
  const threadKey = String(req.body.threadKey || "");
  if (!/^(direct|group|ride):[A-Za-z0-9]+$/.test(threadKey)) return res.status(400).json({ error: "Fil invalide." });
  await prisma.readMarker.upsert({
    where: { userId_threadKey: { userId: req.user.id, threadKey } },
    update: { readAt: new Date() },
    create: { userId: req.user.id, threadKey, readAt: new Date() },
  });
  res.json({ ok: true });
});

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
  if (req.user.role === "DISPATCH" || req.user.role === "ADMIN") {
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

// Un chauffeur ne peut écrire au client qu'à l'approche de la course : à partir d'une heure avant
// l'heure de prise en charge, ou dès que la course est en cours. Avant cela, il passe par Taxi
// Sylvain. Le client, lui, peut écrire quand il veut.
const DRIVER_MESSAGE_WINDOW_MS = 60 * 60 * 1000;

export function driverMayMessageClient(ride, now = new Date()) {
  if (["EN_ROUTE", "STARTED", "COMPLETED"].includes(ride.status)) return true;
  if (!ride.scheduledFor) return true; // course immédiate : pas d'heure programmée
  return now.getTime() >= new Date(ride.scheduledFor).getTime() - DRIVER_MESSAGE_WINDOW_MS;
}

router.post("/:rideId", requireRideParty, async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "Message vide." });

  if (req.user.role === "DRIVER" && !driverMayMessageClient(req.ride)) {
    const when = new Date(new Date(req.ride.scheduledFor).getTime() - DRIVER_MESSAGE_WINDOW_MS)
      .toLocaleString("fr-CA", { timeZone: "America/Toronto", dateStyle: "short", timeStyle: "short" });
    return res.status(403).json({
      error: `Vous pourrez écrire au client à partir de ${when} (une heure avant la course). D'ici là, passez par Taxi Sylvain.`,
    });
  }

  const message = await prisma.message.create({
    data: { rideId: req.params.rideId, senderId: req.user.id, text },
    include: { sender: { select: { id: true, name: true, role: true } } },
  });

  const io = req.app.get("io");
  if (io) {
    io.to(`ride:${req.params.rideId}`).emit("message:new", message);
    // Aussi vers les espaces personnels des deux parties : son et badge « non lu » même si
    // l'écran de discussion n'est pas ouvert.
    for (const partyId of [req.ride.clientId, req.ride.driverId]) {
      if (!partyId || partyId === req.user.id) continue;
      const party = await prisma.user.findUnique({ where: { id: partyId }, select: { id: true, role: true } });
      const room = party && personalRoom(party);
      if (room) io.to(room).emit("message:ride", message);
    }
  }

  const otherPartyId = req.user.id === req.ride.clientId ? req.ride.driverId : req.ride.clientId;
  if (otherPartyId && req.user.role !== "DISPATCH") {
    notifyUser(otherPartyId, { title: `Message de ${req.user.name}`, body: text, data: { type: "message:ride", rideId: req.params.rideId } });
  }
  res.status(201).json(message);
});

export default router;
