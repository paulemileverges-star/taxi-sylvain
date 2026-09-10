import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { isConfigured as isCallMaskingConfigured, getOrCreateCallSession } from "../lib/twilioProxy.js";
import { notifyUser, notifyAllDrivers } from "../lib/push.js";
import { createDriverAccount } from "./drivers.js";
import { generateTempPassword } from "../lib/placeholderEmail.js";

// Réservation par téléphone (besoin #5) : le Dispatch peut créer une course pour un client sans
// compte — on retrouve son compte existant par téléphone, ou on lui en crée un à la volée. Si le
// client est réellement créé (pas seulement retrouvé), un mot de passe temporaire est renvoyé en
// clair pour que le Dispatch puisse le transmettre.
async function findOrCreateClientByPhone(name, phone, email, address, notes) {
  const existing = await prisma.user.findFirst({ where: { role: "CLIENT", phone } });
  if (existing) return { id: existing.id, tempPassword: null };

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const finalEmail = email || `client-${crypto.randomBytes(6).toString("hex")}@reservation.taxisylvain.local`;
  const created = await prisma.user.create({
    data: { role: "CLIENT", name, phone, email: finalEmail, address: address || null, notes: notes || null, passwordHash },
  });
  return { id: created.id, tempPassword };
}

const router = Router();
router.use(requireAuth);

const TERMINAL_STATUSES = ["COMPLETED", "CANCELLED", "REFUSED"];
const RIDE_INCLUDE = {
  driver: { select: { id: true, name: true, carModel: true, plate: true, ratingAvg: true, photoUrl: true, carPhotoUrl: true } },
  client: { select: { id: true, name: true } },
};

// Liste des courses — filtrée selon le rôle. Sans "when", renvoie tout (comportement historique,
// utilisé par l'écran d'accueil). Avec "when=upcoming|past", pagine par lot de 10 (besoin #4).
router.get("/", async (req, res) => {
  const { role, id } = req.user;
  let where = {};
  if (role === "CLIENT") where = { clientId: id };
  if (role === "DRIVER") where = { OR: [{ driverId: id }, { status: "BROADCAST" }] };
  // DISPATCH voit tout

  const { when, page = "1", pageSize = "10" } = req.query;
  if (when === "past") where = { ...where, status: { in: TERMINAL_STATUSES } };
  else if (when === "upcoming") where = { ...where, status: { notIn: TERMINAL_STATUSES } };

  if (when) {
    const take = Math.min(Number(pageSize) || 10, 50);
    const skip = (Math.max(Number(page), 1) - 1) * take;
    const [rides, total] = await Promise.all([
      prisma.ride.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: RIDE_INCLUDE }),
      prisma.ride.count({ where }),
    ]);
    return res.json({ rides, total, page: Number(page), pageSize: take });
  }

  const rides = await prisma.ride.findMany({ where, orderBy: { createdAt: "desc" }, include: RIDE_INCLUDE });
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
  const {
    pickupAddress, destAddress, distanceKm, fare, scheduledFor, flightNumber,
    clientName, clientPhone, clientEmail, clientAddress, clientNotes,
    pickupLat, pickupLng, destLat, destLng, broadcastAll,
    newDriver, // { name, email, phone, password?, carModel?, plate? } — créé à la volée et affecté
  } = req.body;
  let { driverId } = req.body;
  if (!pickupAddress || !destAddress || !fare) {
    return res.status(400).json({ error: "Adresse de prise en charge, destination et montant requis." });
  }

  let clientId = req.user.role === "CLIENT" ? req.user.id : req.body.clientId ?? null;
  let clientTempPassword = null;
  if (!clientId && req.user.role === "DISPATCH" && clientName && clientPhone) {
    const result = await findOrCreateClientByPhone(clientName, clientPhone, clientEmail, clientAddress, clientNotes);
    clientId = result.id;
    clientTempPassword = result.tempPassword;
  }

  let driverTempPassword = null;
  if (!driverId && req.user.role === "DISPATCH" && newDriver?.name && newDriver?.email && newDriver?.phone) {
    try {
      const { driver, tempPassword } = await createDriverAccount(newDriver);
      driverId = driver.id;
      driverTempPassword = tempPassword;
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message });
    }
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
      status: broadcastAll ? "BROADCAST" : driverId ? "ACCEPTED" : "REQUESTED",
      pickupLat: typeof pickupLat === "number" ? pickupLat : null,
      pickupLng: typeof pickupLng === "number" ? pickupLng : null,
      destLat: typeof destLat === "number" ? destLat : null,
      destLng: typeof destLng === "number" ? destLng : null,
    },
    include: { client: { select: { id: true, name: true } } },
  });

  broadcast(req, "dispatch", "ride:created", ride);
  if (driverId) {
    broadcast(req, `driver:${driverId}`, "ride:assigned", ride);
    notifyUser(driverId, {
      title: "Nouvelle course assignée",
      body: `${ride.pickupAddress} → ${ride.destAddress}`,
      data: { type: "ride:assigned", rideId: ride.id },
    });
  } else if (broadcastAll) {
    broadcast(req, "drivers", "ride:broadcast", ride);
    notifyAllDrivers({
      title: "Course de dernière minute",
      body: `${ride.pickupAddress} → ${ride.destAddress} — premier arrivé, premier servi`,
      data: { type: "ride:broadcast", rideId: ride.id },
    });
  }
  res.status(201).json({ ...ride, clientTempPassword, driverTempPassword });
});

// Affecter / réaffecter un chauffeur (Dispatch)
router.post("/:id/assign", requireRole("DISPATCH"), async (req, res) => {
  const { driverId } = req.body; // null pour retirer l'affectation
  const ride = await prisma.ride.update({
    where: { id: req.params.id },
    data: { driverId, status: driverId ? "ACCEPTED" : "REQUESTED" },
  });
  if (driverId) {
    broadcast(req, `driver:${driverId}`, "ride:assigned", ride);
    notifyUser(driverId, {
      title: "Nouvelle course assignée",
      body: `${ride.pickupAddress} → ${ride.destAddress}`,
      data: { type: "ride:assigned", rideId: ride.id },
    });
  }
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
  notifyAllDrivers({
    title: "Course de dernière minute",
    body: `${ride.pickupAddress} → ${ride.destAddress} — premier arrivé, premier servi`,
    data: { type: "ride:broadcast", rideId: ride.id },
  });
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

// Progression du statut par le chauffeur : EN_ROUTE -> STARTED -> COMPLETED, ou annulation
// (CANCELLED) tant que la course n'est pas terminée — permet au chauffeur de libérer une course
// qu'il ne peut finalement pas honorer (besoin #9).
router.post("/:id/status", requireRole("DRIVER"), async (req, res) => {
  const { status } = req.body;
  const allowed = { EN_ROUTE: "enRouteAt", STARTED: "startedAt", COMPLETED: "completedAt", CANCELLED: "cancelledAt" };
  if (!allowed[status]) return res.status(400).json({ error: "Statut invalide." });

  const current = await prisma.ride.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ error: "Course introuvable." });
  if (current.driverId !== req.user.id) return res.status(403).json({ error: "Cette course ne vous est pas affectée." });

  const ride = await prisma.ride.update({
    where: { id: req.params.id },
    data:
      status === "CANCELLED"
        ? { status, cancelledAt: new Date(), driverId: null }
        : { status, [allowed[status]]: new Date() },
  });

  const labels = {
    EN_ROUTE: `${req.user.name} est en route pour récupérer le client.`,
    STARTED: `${req.user.name} a démarré la course vers la destination.`,
    COMPLETED: `La course de ${req.user.name} est terminée.`,
    CANCELLED: `${req.user.name} a annulé la course — elle n'est plus affectée.`,
  };
  broadcast(req, "dispatch", "ride:notification", { rideId: ride.id, text: labels[status] });
  broadcast(req, `ride:${ride.id}`, "ride:status", ride);

  const clientLabels = {
    EN_ROUTE: { title: "Votre chauffeur arrive", body: `${req.user.name} est en route pour vous récupérer.` },
    STARTED: { title: "Départ vers votre destination", body: "Votre course a démarré." },
    COMPLETED: { title: "Course terminée", body: "Merci d'avoir voyagé avec Taxi Sylvain." },
    CANCELLED: { title: "Changement de chauffeur", body: "Taxi Sylvain vous réaffecte un autre chauffeur pour votre course." },
  };
  if (ride.clientId && clientLabels[status]) {
    notifyUser(ride.clientId, { ...clientLabels[status], data: { type: "ride:status", rideId: ride.id, status } });
  }
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

// Corriger les détails d'une course (Dispatch) — utilisé notamment depuis le lien "Voir la
// course" d'un message envoyé par un chauffeur à propos d'une course précise (besoin #3).
router.patch("/:id", requireRole("DISPATCH"), async (req, res) => {
  const { pickupAddress, destAddress, fare, flightNumber, scheduledFor, pickupLat, pickupLng, destLat, destLng } = req.body;
  const data = {};
  if (pickupAddress !== undefined) data.pickupAddress = pickupAddress;
  if (destAddress !== undefined) data.destAddress = destAddress;
  if (fare !== undefined) data.fare = Number(fare);
  if (flightNumber !== undefined) data.flightNumber = flightNumber || null;
  if (scheduledFor !== undefined) data.scheduledFor = scheduledFor ? new Date(scheduledFor) : null;
  if (pickupLat !== undefined) data.pickupLat = typeof pickupLat === "number" ? pickupLat : null;
  if (pickupLng !== undefined) data.pickupLng = typeof pickupLng === "number" ? pickupLng : null;
  if (destLat !== undefined) data.destLat = typeof destLat === "number" ? destLat : null;
  if (destLng !== undefined) data.destLng = typeof destLng === "number" ? destLng : null;

  try {
    const ride = await prisma.ride.update({
      where: { id: req.params.id },
      data,
      include: { client: { select: { id: true, name: true } }, driver: { select: { id: true, name: true } } },
    });
    broadcast(req, "dispatch", "ride:updated", ride);
    broadcast(req, `ride:${ride.id}`, "ride:status", ride);
    if (ride.driverId) broadcast(req, `driver:${ride.driverId}`, "ride:assigned", ride);
    res.json(ride);
  } catch (e) {
    res.status(404).json({ error: "Course introuvable." });
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
