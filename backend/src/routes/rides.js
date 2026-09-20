import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, requirePermission } from "../middleware/auth.js";
import { isConfigured as isCallMaskingConfigured, getOrCreateCallSession, callAllowedForStatus } from "../lib/twilioProxy.js";
import { notifyUser, notifyAllDrivers } from "../lib/push.js";
import { createDriverAccount } from "./drivers.js";
import { generateTempPassword } from "../lib/placeholderEmail.js";
import { computeDistanceKm, geocodeAddress } from "../lib/distance.js";
import { clearDriverLocation, getDriverLocation } from "../lib/driverLocations.js";
import { quote } from "../lib/pricing.js";
import { sendRideConfirmation, sendRideCancellation, loadRideForEmail } from "../lib/rideEmails.js";
import { pageDeCourses } from "../lib/ridesOrder.js";

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
  if (role === "DRIVER") where = { OR: [{ driverId: id }, { status: "BROADCAST", NOT: { refusedBy: { has: id } } }] };
  // DISPATCH voit tout

  const { when, page = "1", pageSize = "10" } = req.query;
  if (when === "past") where = { ...where, status: { in: TERMINAL_STATUSES } };
  else if (when === "upcoming") where = { ...where, status: { notIn: TERMINAL_STATUSES } };

  if (when) {
    // Le classement suit « heure de prise en charge, sinon heure de création », que PostgreSQL ne
    // sait pas exprimer dans un orderBy : il se fait donc en mémoire. Pour ne pas charger tout
    // l'historique avec ses relations à chaque page, on ne lit d'abord que les dates, puis on ne
    // recharge en détail que les courses de la page demandée.
    // Le orderBy reste indispensable : sans ORDER BY, PostgreSQL peut renvoyer les lignes dans un
    // ordre différent d'une requête à l'autre, et une course changerait de page entre deux pages.
    const legeres = await prisma.ride.findMany({ where, select: { id: true, scheduledFor: true, createdAt: true }, orderBy: { id: "asc" } });
    const { rides: refs, total, page: numero, pageSize: taille } = pageDeCourses(legeres, { when, page, pageSize });
    const completes = await prisma.ride.findMany({ where: { id: { in: refs.map((r) => r.id) } }, include: RIDE_INCLUDE });
    const parId = new Map(completes.map((r) => [r.id, r]));
    // RIDE_INCLUDE est la seule protection des données personnelles sur cette route : on recompose
    // donc chaque course à partir de SON résultat, jamais à partir de la requête légère.
    const rides = refs.filter((r) => parId.has(r.id)).map((r) => ({ ...parId.get(r.id), dayKey: r.dayKey, dayLabel: r.dayLabel }));
    return res.json({ rides, total, page: numero, pageSize: taille });
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
  const isStaff = req.user.role === "DISPATCH" || req.user.role === "ADMIN";
  const isParty = req.user.id === ride.clientId || req.user.id === ride.driverId;
  const isOpenOffer = req.user.role === "DRIVER" && ride.status === "BROADCAST";
  if (!isStaff && !isParty && !isOpenOffer) return res.status(403).json({ error: "Accès refusé." });
  res.json(sanitizeRide(ride, req.user));
});

// Créer une course (Dispatch ou Client)
router.post("/", requirePermission("courses", "CLIENT"), async (req, res) => {
  const {
    pickupAddress, distanceKm, scheduledFor, flightNumber, destinationCode,
    clientName, clientPhone, clientEmail, clientAddress, clientNotes,
    pickupLat, pickupLng, broadcastAll,
    newDriver, // { name, email, phone, password?, carModel?, plate? } — créé à la volée et affecté
  } = req.body;
  let { driverId, destAddress, destLat, destLng, fare } = req.body;
  const isClientBooking = req.user.role === "CLIENT";

  // Destination prédéfinie (YUL, YHU, REM...) : adresse, coordonnées et tarif du catalogue selon
  // la municipalité de prise en charge. Le tarif du catalogue s'impose au client ; le Dispatch
  // peut le surcharger en saisissant un montant.
  // Qui est le client ? Résolu ICI, en lecture seule, car son prix négocié l'emporte sur la grille.
  // La création d'un compte client, elle, reste plus bas : la remonter fabriquerait un compte
  // fantôme à chaque formulaire refusé.
  const isStaff = req.user.role === "DISPATCH" || req.user.role === "ADMIN";
  let clientId = req.user.role === "CLIENT" ? req.user.id : req.body.clientId ?? null;
  let quoteClientId = clientId;
  if (!quoteClientId && isStaff && clientPhone) {
    const connu = await prisma.user.findFirst({ where: { role: "CLIENT", phone: clientPhone }, select: { id: true } });
    quoteClientId = connu?.id ?? null;
  }

  if (destinationCode) {
    const q = await quote({ pickupAddress, destinationCode, clientId: quoteClientId });
    if (q.destination) {
      destAddress = q.destination.address;
      destLat = q.destination.lat;
      destLng = q.destination.lng;
      if (isClientBooking || !fare) fare = q.price ?? 0;
    }
  }

  // Un client qui réserve dans l'app ne connaît pas le tarif : sans destination au catalogue, le
  // montant reste à 0 (« à confirmer ») jusqu'à ce que Taxi Sylvain le fixe. Le Dispatch, lui,
  // doit toujours saisir un montant.
  if (!pickupAddress || !destAddress || (!fare && !isClientBooking)) {
    return res.status(400).json({ error: "Adresse de prise en charge, destination et montant requis." });
  }

  let clientTempPassword = null;
  if (!clientId && isStaff && clientName && clientPhone) {
    // Nouveau client créé pendant la réservation : sans adresse de domicile explicite, on retient
    // l'adresse de prise en charge (c'est presque toujours chez lui) — les deux écrans concordent.
    const result = await findOrCreateClientByPhone(clientName, clientPhone, clientEmail, clientAddress || pickupAddress, clientNotes);
    clientId = result.id;
    clientTempPassword = result.tempPassword;
  }

  let driverTempPassword = null;
  if (!driverId && isStaff && newDriver?.name && newDriver?.email && newDriver?.phone) {
    try {
      const { driver, tempPassword } = await createDriverAccount(newDriver);
      driverId = driver.id;
      driverTempPassword = tempPassword;
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message });
    }
  }

  // Adresse de départ sans coordonnées (domicile du client, saisie libre) : on tente de la
  // géocoder pour pouvoir calculer la distance.
  let pickup = { lat: pickupLat, lng: pickupLng };
  if (typeof pickup.lat !== "number" || typeof pickup.lng !== "number") pickup = (await geocodeAddress(pickupAddress)) || pickup;
  const dest = { lat: destLat, lng: destLng };
  const computedDistance = typeof distanceKm === "number" ? distanceKm : await computeDistanceKm(pickup, dest);

  const ride = await prisma.ride.create({
    data: {
      pickupAddress,
      destAddress,
      distanceKm: computedDistance,
      fare: isClientBooking ? Number(fare) || 0 : Number(fare),
      flightNumber: flightNumber || null,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      clientId,
      driverId: driverId ?? null,
      status: broadcastAll ? "BROADCAST" : driverId ? "ACCEPTED" : "REQUESTED",
      pickupLat: typeof pickup.lat === "number" ? pickup.lat : null,
      pickupLng: typeof pickup.lng === "number" ? pickup.lng : null,
      destLat: typeof destLat === "number" ? destLat : null,
      destLng: typeof destLng === "number" ? destLng : null,
    },
    include: { client: { select: { id: true, name: true } } },
  });

  broadcast(req, "dispatch", "ride:created", ride);
  if (isClientBooking) {
    // Le client est prévenu tout de suite si le tarif du catalogue s'est appliqué, sinon que sa
    // demande attend la validation (montant) de Taxi Sylvain.
    broadcast(req, "dispatch", "ride:notification", {
      rideId: ride.id,
      status: ride.status,
      text: `${req.user.name} a réservé une course ${ride.pickupAddress} → ${ride.destAddress}${ride.fare > 0 ? ` (${ride.fare.toFixed(2)} $, tarif catalogue)` : " — montant à confirmer"}.`,
    });
  }
  if (driverId) {
    broadcast(req, `driver:${driverId}`, "ride:assigned", ride);
    notifyUser(driverId, {
      title: "Nouvelle course assignée",
      body: `${ride.pickupAddress} → ${ride.destAddress}`,
      data: { type: "ride:assigned", rideId: ride.id },
    });
    // Course confirmée dès sa création : courriel + invitation d'agenda au chauffeur et au client.
    sendRideConfirmation(ride.id);
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
router.post("/:id/assign", requirePermission("courses"), async (req, res) => {
  const { driverId } = req.body; // null pour retirer l'affectation
  const previous = await loadRideForEmail(req.params.id);
  const ride = await prisma.ride.update({
    where: { id: req.params.id },
    data: { driverId, status: driverId ? "ACCEPTED" : "REQUESTED" },
    include: { driver: { select: { name: true, carModel: true, plate: true } } },
  });

  // Changement de chauffeur : l'ancien voit la course disparaître de son agenda, le nouveau la
  // reçoit. Sans changement (réenregistrement du même chauffeur), on n'envoie rien.
  const driverChanged = previous?.driverId !== driverId;
  if (driverChanged && previous?.driverId && previous.driver) {
    sendRideCancellation(previous, [{ person: previous.driver, audience: "driver" }]);
  }
  if (driverChanged && driverId) sendRideConfirmation(ride.id);
  if (driverChanged && previous?.driverId) leaveRideRoom(req, previous.driverId, ride.id);

  if (driverId) {
    broadcast(req, `driver:${driverId}`, "ride:assigned", ride);
    notifyUser(driverId, {
      title: "Nouvelle course assignée",
      body: `${ride.pickupAddress} → ${ride.destAddress}`,
      data: { type: "ride:assigned", rideId: ride.id },
    });
    if (ride.clientId) {
      notifyUser(ride.clientId, {
        title: "Votre chauffeur est confirmé",
        body: `${ride.driver.name}${ride.driver.carModel ? ` · ${ride.driver.carModel}` : ""}${ride.driver.plate ? ` · ${ride.driver.plate}` : ""} — ${ride.pickupAddress} → ${ride.destAddress}`,
        data: { type: "ride:status", rideId: ride.id, status: ride.status },
      });
    }
  }
  broadcast(req, "dispatch", "ride:updated", ride);
  broadcast(req, `ride:${ride.id}`, "ride:status", ride);
  res.json(ride);
});

// Diffuser une course de dernière minute à tous les chauffeurs
router.post("/:id/broadcast", requirePermission("courses"), async (req, res) => {
  const before = await prisma.ride.findUnique({ where: { id: req.params.id }, select: { driverId: true } });
  if (!before) return res.status(404).json({ error: "Course introuvable." });
  const ride = await prisma.ride.update({
    where: { id: req.params.id },
    data: { status: "BROADCAST", driverId: null },
  });
  if (before.driverId) leaveRideRoom(req, before.driverId, ride.id);
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
  broadcast(req, "dispatch", "ride:notification", {
    rideId: result.id,
    status: result.status,
    text: `${req.user.name} a accepté la course ${result.pickupAddress} → ${result.destAddress}.`,
  });
  broadcast(req, "drivers", "ride:taken", { id: result.id }); // pour retirer la course chez les autres chauffeurs
  broadcast(req, `ride:${result.id}`, "ride:status", result);
  sendRideConfirmation(result.id); // le chauffeur qui prend la course la reçoit dans son agenda
  res.json(result);
});

// Dernière position connue du chauffeur de cette course — pour afficher la carte tout de suite
// à l'ouverture du suivi, sans attendre la prochaine mise à jour GPS.
router.get("/:id/driver-location", async (req, res) => {
  const ride = await prisma.ride.findUnique({ where: { id: req.params.id } });
  if (!ride) return res.status(404).json({ error: "Course introuvable." });
  const isStaff = req.user.role === "DISPATCH" || req.user.role === "ADMIN";
  if (!isStaff && req.user.id !== ride.clientId && req.user.id !== ride.driverId) {
    return res.status(403).json({ error: "Accès refusé." });
  }
  if (!ride.driverId) return res.json(null);
  const pos = getDriverLocation(ride.driverId);
  res.json(pos && pos.rideId === ride.id ? { lat: pos.lat, lng: pos.lng, status: pos.status, at: pos.at } : null);
});

router.post("/:id/refuse", requireRole("DRIVER"), async (req, res) => {
  // Un refus individuel ne change pas le statut global : la course reste disponible pour les
  // autres, mais n'est plus proposée à ce chauffeur.
  const ride = await prisma.ride.findUnique({ where: { id: req.params.id } });
  if (!ride) return res.status(404).json({ error: "Course introuvable." });
  if (!ride.refusedBy.includes(req.user.id)) {
    await prisma.ride.update({ where: { id: ride.id }, data: { refusedBy: { push: req.user.id } } });
  }
  broadcast(req, "dispatch", "ride:refused", { rideId: ride.id, driverId: req.user.id, driverName: req.user.name });
  broadcast(req, "dispatch", "ride:notification", { rideId: ride.id, text: `${req.user.name} a refusé la course diffusée ${ride.pickupAddress} → ${ride.destAddress}.` });
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

  // Ordre des étapes imposé : ACCEPTED -> EN_ROUTE -> STARTED -> COMPLETED ; annulation possible
  // à tout moment avant la fin. Évite qu'un double appui ou un écran désynchronisé ne saute
  // une étape (ex. terminer une course jamais démarrée).
  const NEXT = { ACCEPTED: "EN_ROUTE", EN_ROUTE: "STARTED", STARTED: "COMPLETED" };
  const isTerminal = ["COMPLETED", "CANCELLED", "REFUSED"].includes(current.status);
  if (isTerminal) return res.status(409).json({ error: "Cette course est déjà terminée ou annulée." });
  if (status !== "CANCELLED" && NEXT[current.status] !== status) {
    return res.status(409).json({ error: `Étape invalide : la course est actuellement « ${current.status} ».` });
  }

  // Annulation par le chauffeur : on garde la course complète sous la main pour pouvoir retirer
  // l'évènement de son agenda après la mise à jour (la course ne lui sera plus rattachée).
  const previous = status === "CANCELLED" ? await loadRideForEmail(req.params.id) : null;

  const ride = await prisma.ride.update({
    where: { id: req.params.id },
    data:
      status === "CANCELLED"
        ? { status, cancelledAt: new Date(), driverId: null }
        : { status, [allowed[status]]: new Date() },
  });

  if (status === "CANCELLED" && previous?.driver) {
    sendRideCancellation(previous, [{ person: previous.driver, audience: "driver" }]);
  }
  if (status === "CANCELLED") leaveRideRoom(req, req.user.id, ride.id);

  const labels = {
    EN_ROUTE: `${req.user.name} est en route pour récupérer le client.`,
    STARTED: `${req.user.name} a démarré la course vers la destination.`,
    COMPLETED: `La course de ${req.user.name} est terminée.`,
    CANCELLED: `${req.user.name} a annulé la course — elle n'est plus affectée.`,
  };
  broadcast(req, "dispatch", "ride:notification", { rideId: ride.id, status, text: labels[status] });
  broadcast(req, "dispatch", "ride:updated", ride);
  broadcast(req, `ride:${ride.id}`, "ride:status", ride);

  if (status === "COMPLETED" || status === "CANCELLED") {
    // Course finie : le chauffeur n'a plus à apparaître sur la carte.
    if (clearDriverLocation(req.user.id)) broadcast(req, "dispatch", "driver:location:clear", { driverId: req.user.id });
  }

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
  if (!callAllowedForStatus(ride.status)) {
    return res.status(409).json({ error: "L'appel masqué n'est possible que pour une course confirmée ou en cours." });
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
    // Numéro mal saisi dans une fiche : message clair, sans révéler le numéro de l'autre partie.
    // Seulement notre propre erreur : celles de Twilio restent génériques et sont journalisées.
    if (err.code === "NUMERO_INVALIDE") return res.status(400).json({ error: err.message });
    console.error("Erreur Twilio Proxy:", err.message);
    res.status(502).json({ error: "Impossible de créer l'appel masqué pour le moment." });
  }
});

// Corriger les détails d'une course (Dispatch) — utilisé notamment depuis le lien "Voir la
// course" d'un message envoyé par un chauffeur à propos d'une course précise (besoin #3).
router.patch("/:id", requirePermission("courses"), async (req, res) => {
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
    // Recalcule la distance si une adresse (avec coordonnées) a changé.
    if (pickupLat !== undefined || pickupLng !== undefined || destLat !== undefined || destLng !== undefined) {
      const current = await prisma.ride.findUnique({ where: { id: req.params.id } });
      if (!current) return res.status(404).json({ error: "Course introuvable." });
      const merged = { ...current, ...data };
      data.distanceKm = await computeDistanceKm({ lat: merged.pickupLat, lng: merged.pickupLng }, { lat: merged.destLat, lng: merged.destLng });
    }
    const before = await loadRideForEmail(req.params.id);
    const ride = await prisma.ride.update({
      where: { id: req.params.id },
      data,
      include: { client: { select: { id: true, name: true } }, driver: { select: { id: true, name: true, carModel: true, plate: true } } },
    });
    broadcast(req, "dispatch", "ride:updated", ride);
    broadcast(req, `ride:${ride.id}`, "ride:status", ride);
    if (ride.driverId) broadcast(req, `driver:${ride.driverId}`, "ride:assigned", ride);

    // Un détail qui figure dans l'agenda a changé : on renvoie l'invitation mise à jour, qui
    // remplace l'évènement déjà présent chez le chauffeur et le client.
    const AGENDA_FIELDS = ["scheduledFor", "pickupAddress", "destAddress", "fare", "flightNumber"];
    const agendaChanged = AGENDA_FIELDS.some((field) => {
      if (data[field] === undefined || !before) return false;
      const a = before[field] instanceof Date ? before[field].getTime() : before[field];
      const b = ride[field] instanceof Date ? ride[field].getTime() : ride[field];
      return a !== b;
    });
    if (agendaChanged && (ride.driverId || ride.clientId)) sendRideConfirmation(ride.id);

    // Taxi Sylvain vient de fixer (ou corriger) le montant : le client reçoit le récapitulatif.
    if (ride.clientId && data.fare !== undefined && ride.fare > 0 && ride.fare !== before?.fare) {
      const when = ride.scheduledFor
        ? new Date(ride.scheduledFor).toLocaleString("fr-CA", { timeZone: "America/Toronto", dateStyle: "short", timeStyle: "short" })
        : "dès que possible";
      notifyUser(ride.clientId, {
        title: `Course validée — ${ride.fare.toFixed(2)} $`,
        body: `${ride.pickupAddress} → ${ride.destAddress} · ${when}${ride.driver ? ` · chauffeur ${ride.driver.name}` : ""}`,
        data: { type: "ride:status", rideId: ride.id, status: ride.status },
      });
    }
    res.json(ride);
  } catch (e) {
    res.status(404).json({ error: "Course introuvable." });
  }
});

// Supprimer une course erronée (Dispatch)
router.delete("/:id", requirePermission("courses"), async (req, res) => {
  try {
    // Chargée avant la suppression : les courriels d'annulation ont encore besoin de ses détails.
    const previous = await loadRideForEmail(req.params.id);
    await prisma.$transaction(async (tx) => {
      await tx.rating.deleteMany({ where: { rideId: req.params.id } });
      await tx.ride.delete({ where: { id: req.params.id } });
    });
    // La course n'existe plus : plus personne ne reste abonné à son suivi.
    req.app.get("io")?.socketsLeave(`ride:${req.params.id}`);
    if (previous) {
      sendRideCancellation(previous, [
        previous.driver ? { person: previous.driver, audience: "driver" } : null,
        previous.client ? { person: previous.client, audience: "client" } : null,
      ]);
    }
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

// Retire toutes les connexions d'un compte du suivi d'une course : position, messages et étapes.
// Sans cela, un chauffeur à qui la course était retirée continuait de recevoir la discussion
// entre le client et le nouveau chauffeur (relecture du 19 septembre 2026).
function leaveRideRoom(req, userId, rideId) {
  const io = req.app.get("io");
  if (io && userId) io.in(`user:${userId}`).socketsLeave(`ride:${rideId}`);
}

function broadcast(req, room, event, payload) {
  const io = req.app.get("io");
  if (io) io.to(room).emit(event, payload);
}

export default router;
