import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { isConfigured as isCallMaskingConfigured, getOrCreateCallSession } from "../lib/twilioProxy.js";

// Réservation par téléphone (besoin #5) : le Dispatch peut créer une course pour un client sans
// compte — on retrouve son compte existant par téléphone, ou on lui en crée un à la volée.
async function findOrCreateClientByPhone(name, phone) {
  const existing = await prisma.user.findFirst({ where: { role: "CLIENT", phone } });
  if (existing) return existing.id;

  const passwordHash = await bcrypt.hash(crypto.randomBytes(16).toString("hex"), 10);
  const email = `client-${crypto.randomBytes(6).toString("hex")}@reservation.taxisylvain.local`;
  const created = await prisma.user.create({
    data: { role: "CLIENT", name, phone, email, passwordHash },
  });
  return created.id;
}

const router = Router();
router.use(requireAuth);

// Liste des courses — filtrée selon le rôle
router.get("/", async (req, res) => {
  const { role, id } = req.user;
  let where = {};
  if (role === "CLIENT") where = { clientId: id };
  if (role === "DRIVER") where = { OR: [{ driverId: id }, { status: "BROADCAST" }] };
  // DISPATCH voit tout

  const rides = await prisma.ride.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { driver: { select: { id: true, name: true, carModel: true, plate: true, ratingAvg: true, photoUrl: true, carPhotoUrl: true } }, client: { select: { id: true, name: true } } },
  });
  res.json(rides);
});

router.get("/:id", async (req, res) => {
  const ride = await prisma.ride.findUnique({
    where: { id: req.params.id },
    include: { driver: true, client: true, messages: true, ratings: true },
  });
  if (!ride) return res.status(404).json({ error: "Course introuvable." });
  res.json(sanitizeRide(ride, req.user));
});

// Créer une course (Dispatch ou Client)
router.post("/", requireRole("DISPATCH", "CLIENT"), async (req, res) => {
  const { pickupAddress, destAddress, distanceKm, fare, driverId, scheduledFor, flightNumber, clientName, clientPhone, pickupLat, pickupLng, destLat, destLng } = req.body;
  if (!pickupAddress || !destAddress || !fare) {
    return res.status(400).json({ error: "Adresse de prise en charge, destination et montant requis." });
  }

  let clientId = req.user.role === "CLIENT" ? req.user.id : req.body.clientId ?? null;
  if (!clientId && req.user.role === "DISPATCH" && clientName && clientPhone) {
    clientId = await findOrCreateClientByPhone(clientName, clientPhone);
  }

  const ride = await prisma.ride.create({
    data: {
      pickupAddress,
      destAddress,
      distanceKm,
      fare,
      flightNumber: flightNumber || null,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      clientId,
      driverId: driverId ?? null,
      status: driverId ? "ACCEPTED" : "REQUESTED",
      pickupLat: typeof pickupLat === "number" ? pickupLat : null,
      pickupLng: typeof pickupLng === "number" ? pickupLng : null,
      destLat: typeof destLat === "number" ? destLat : null,
      destLng: typeof destLng === "number" ? destLng : null,
    },
    include: { client: { select: { id: true, name: true } } },
  });

  broadcast(req, "dispatch", "ride:created", ride);
  if (driverId) broadcast(req, `driver:${driverId}`, "ride:assigned", ride);
  res.status(201).json(ride);
});

// Affecter / réaffecter un chauffeur (Dispatch)
router.post("/:id/assign", requireRole("DISPATCH"), async (req, res) => {
  const { driverId } = req.body; // null pour retirer l'affectation
  const ride = await prisma.ride.update({
    where: { id: req.params.id },
    data: { driverId, status: driverId ? "ACCEPTED" : "REQUESTED" },
  });
  if (driverId) broadcast(req, `driver:${driverId}`, "ride:assigned", ride);
  broadcast(req, "dispatch", "ride:updated", ride);
  broadcast(req, `ride:${ride.id}`, "ride:status", ride);
  res.json(ride);
});

// Diffuser une course de dernière minute à tous les chauffeurs
router.post("/:id/broadcast", requireRole("DISPATCH"), async (req, res) => {
  const ride = await prisma.ride.update({
    where: { id: req.params.id },
    data: { status: "BROADCAST", driverId: null },
  });
  broadcast(req, "drivers", "ride:broadcast", ride);
  res.json(ride);
});

// Un chauffeur accepte une course diffusée — le premier arrivé l'obtient
router.post("/:id/accept", requireRole("DRIVER"), async (req, res) => {
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.ride.findUnique({ where: { id: req.params.id } });
    if (!current) throw new Error("NOT_FOUND");
    if (current.status !== "BROADCAST" && current.status !== "REQUESTED") {
      throw new Error("ALREADY_TAKEN");
    }
    return tx.ride.update({
      where: { id: req.params.id },
      data: { driverId: req.user.id, status: "ACCEPTED", acceptedAt: new Date() },
    });
  }).catch((e) => e);

  if (result instanceof Error) {
    const code = result.message === "ALREADY_TAKEN" ? 409 : 404;
    const msg = result.message === "ALREADY_TAKEN" ? "Cette course a déjà été prise par un autre chauffeur." : "Course introuvable.";
    return res.status(code).json({ error: msg });
  }

  broadcast(req, "dispatch", "ride:updated", result);
  broadcast(req, "drivers", "ride:taken", { id: result.id }); // pour retirer la course chez les autres chauffeurs
  broadcast(req, `ride:${result.id}`, "ride:status", result);
  res.json(result);
});

router.post("/:id/refuse", requireRole("DRIVER"), async (req, res) => {
  // Un refus individuel ne change pas le statut global : la course reste disponible pour les autres.
  broadcast(req, "dispatch", "ride:refused", { rideId: req.params.id, driverId: req.user.id });
  res.json({ ok: true });
});

// Progression du statut par le chauffeur : EN_ROUTE -> STARTED -> COMPLETED
router.post("/:id/status", requireRole("DRIVER"), async (req, res) => {
  const { status } = req.body;
  const allowed = { EN_ROUTE: "enRouteAt", STARTED: "startedAt", COMPLETED: "completedAt" };
  if (!allowed[status]) return res.status(400).json({ error: "Statut invalide." });

  const ride = await prisma.ride.update({
    where: { id: req.params.id },
    data: { status, [allowed[status]]: new Date() },
  });

  const labels = {
    EN_ROUTE: `${req.user.name} est en route pour récupérer le client.`,
    STARTED: `${req.user.name} a démarré la course vers la destination.`,
    COMPLETED: `La course de ${req.user.name} est terminée.`,
  };
  broadcast(req, "dispatch", "ride:notification", { rideId: ride.id, text: labels[status] });
  broadcast(req, `ride:${ride.id}`, "ride:status", ride);
  res.json(ride);
});

// Appel vocal masqué entre le client et le chauffeur de la course (besoin #2) — nécessite un
// compte Twilio configuré (TWILIO_* dans .env), voir docs/ARCHITECTURE.md §3.
router.post("/:id/call", async (req, res) => {
  const ride = await prisma.ride.findUnique({
    where: { id: req.params.id },
    include: { client: true, driver: true },
  });
  if (!ride) return res.status(404).json({ error: "Course introuvable." });
  if (req.user.id !== ride.clientId && req.user.id !== ride.driverId) {
    return res.status(403).json({ error: "Accès refusé." });
  }
  if (!ride.client || !ride.driver) {
    return res.status(400).json({ error: "La course doit avoir un client et un chauffeur affectés." });
  }
  if (!isCallMaskingConfigured()) {
    return res.status(503).json({
      error: "Le masquage d'appel n'est pas configuré. Utilisez la messagerie interne en attendant, ou renseignez TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PROXY_SERVICE_SID dans backend/.env (voir .env.example).",
    });
  }

  try {
    const { proxyNumber } = await getOrCreateCallSession(ride);
    res.json({ proxyNumber });
  } catch (err) {
    console.error("Erreur Twilio Proxy:", err.message);
    res.status(502).json({ error: "Impossible de créer l'appel masqué pour le moment." });
  }
});

// Supprimer une course erronée (Dispatch)
router.delete("/:id", requireRole("DISPATCH"), async (req, res) => {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.rating.deleteMany({ where: { rideId: req.params.id } });
      await tx.ride.delete({ where: { id: req.params.id } });
    });
    res.status(204).end();
  } catch (e) {
    res.status(404).json({ error: "Course introuvable." });
  }
});

function sanitizeRide(ride, requester) {
  // Ne jamais exposer le téléphone direct de l'autre partie — seulement nom, véhicule, note.
  const out = { ...ride };
  if (out.client) out.client = { id: out.client.id, name: out.client.name };
  if (out.driver) out.driver = { id: out.driver.id, name: out.driver.name, carModel: out.driver.carModel, plate: out.driver.plate, ratingAvg: out.driver.ratingAvg, photoUrl: out.driver.photoUrl, carPhotoUrl: out.driver.carPhotoUrl };
  return out;
}

function broadcast(req, room, event, payload) {
  const io = req.app.get("io");
  if (io) io.to(room).emit(event, payload);
}

export default router;
