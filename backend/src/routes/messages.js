import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { quotaParCompte } from "../middleware/rateLimit.js";
import { notifyUser } from "../lib/push.js";
import { personalRoom } from "../lib/rooms.js";
import { chauffeurPeutContacter, ouvertureContact, quandLisible } from "../lib/fenetres.js";
import { AUDIENCES, aPermission, emettreEquipe, estEquipe } from "../lib/equipe.js";

const router = Router();
router.use(requireAuth);

const ACTIVE_RIDE_STATUSES = ["REQUESTED", "BROADCAST", "ACCEPTED", "EN_ROUTE", "STARTED"];

// Longueur maximale d'un message : un échange de travail, pas un document (audit du 7 octobre 2026).
export const LONGUEUR_MAX_MESSAGE = 4000;
const envoiMessages = quotaParCompte("messages", { windowMs: 60 * 1000, max: 30 });

/** Texte d'un message, nettoyé, ou null s'il est vide ou trop long. */
export function texteDeMessage(brut) {
  if (typeof brut !== "string") return null;
  const texte = brut.trim();
  return texte && texte.length <= LONGUEUR_MAX_MESSAGE ? texte : null;
}

// Deux fils bien séparés dans la même table Message (audit du 7 octobre 2026, SEC-01) :
//   - la discussion d'une course entre son client et son chauffeur : rideId renseigné, driverId VIDE ;
//   - le fil direct Taxi Sylvain <-> chauffeur : driverId renseigné, et parfois rideId quand le
//     message porte sur une course précise. Ce fil est INTERNE : le client ne doit jamais le lire.
// Avant le 7 octobre, la lecture du fil d'une course filtrait seulement rideId : le client lisait
// les notes internes rattachées à sa course. Toute lecture côté course passe par ce filtre.
export const FIL_DE_COURSE = { driverId: null };

// Messagerie directe : permission « Messagerie / Groupes » pour un compte ADMIN.
const peutMessagerieDirecte = (user) => aPermission(user, ...AUDIENCES.messagesDirects);

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

  // Fils directs dispatch<->chauffeur
  const direct = { total: 0, byDriver: {} };
  if (req.user.role === "DRIVER") {
    const n = await prisma.message.count({ where: { driverId: me, senderId: { not: me }, createdAt: { gt: after(`direct:${me}`) } } });
    direct.total = n;
    if (n) direct.byDriver[me] = n;
  } else if (estEquipe(req.user) && peutMessagerieDirecte(req.user)) {
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
      const n = await prisma.message.count({ where: { rideId: r.id, ...FIL_DE_COURSE, senderId: { not: me }, createdAt: { gt: after(`ride:${r.id}`) } } });
      if (n) { rides.byRide[r.id] = n; rides.total += n; }
    }
  }

  res.json({ direct, groups, rides, total: direct.total + groups.total + rides.total });
});

// Marque un fil comme lu (appelé à l'ouverture du fil et à chaque message reçu pendant qu'il est ouvert).
router.post("/read", async (req, res) => {
  const threadKey = String(req.body.threadKey || "");
  if (!/^(direct|group|ride):[A-Za-z0-9]{1,64}$/.test(threadKey)) return res.status(400).json({ error: "Fil invalide." });
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

// Qui peut lire ou écrire dans le fil direct d'un chauffeur : le chauffeur lui-même, et l'équipe
// autorisée à la messagerie. Jamais un client, jamais un autre chauffeur.
function accesFilDirect(user, driverId) {
  if (user.role === "DRIVER") return user.id === driverId;
  return estEquipe(user) && peutMessagerieDirecte(user);
}

// Fil direct dispatch<->chauffeur, identifié par l'id du chauffeur peu importe qui écrit.
router.get("/direct/:driverId", async (req, res) => {
  const { driverId } = req.params;
  if (!accesFilDirect(req.user, driverId)) return res.status(403).json({ error: "Accès refusé." });

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

router.post("/direct/:driverId", envoiMessages, async (req, res) => {
  const { driverId } = req.params;
  if (!accesFilDirect(req.user, driverId)) return res.status(403).json({ error: "Accès refusé." });
  const text = texteDeMessage(req.body?.text);
  if (!text) return res.status(400).json({ error: `Message vide ou trop long (${LONGUEUR_MAX_MESSAGE} caractères au plus).` });

  // Le fil n'existe que pour un vrai compte chauffeur.
  const chauffeur = await prisma.user.findUnique({ where: { id: String(driverId) }, select: { role: true } });
  if (!chauffeur || chauffeur.role !== "DRIVER") return res.status(404).json({ error: "Chauffeur introuvable." });

  // Un chauffeur peut écrire "à propos" d'une course précise (bouton dans l'écran de course) —
  // on associe le message à cette course pour que le Dispatch puisse l'ouvrir en un clic. La course
  // doit exister ; un chauffeur ne rattache que l'une de ses courses ou une offre ouverte.
  let rideId = null;
  if (typeof req.body?.rideId === "string" && req.body.rideId) {
    const course = await prisma.ride.findUnique({ where: { id: req.body.rideId }, select: { id: true, driverId: true, status: true } });
    const permise = course && (estEquipe(req.user) || course.driverId === driverId || course.status === "BROADCAST");
    rideId = permise ? course.id : null;
  }

  const message = await prisma.message.create({
    data: { driverId, senderId: req.user.id, text, rideId },
    include: {
      sender: { select: { id: true, name: true, role: true } },
      ride: { select: { id: true, pickupAddress: true, destAddress: true } },
    },
  });

  const io = req.app.get("io");
  if (io) {
    io.to(`driver:${driverId}`).emit("message:direct", message);
    emettreEquipe(io, AUDIENCES.messagesDirects, "message:direct", message);
  }
  if (estEquipe(req.user)) {
    notifyUser(driverId, { title: "Message de Taxi Sylvain", body: text, data: { type: "message:direct" } });
  }
  res.status(201).json(message);
});

async function requireRideParty(req, res, next) {
  const ride = await prisma.ride.findUnique({ where: { id: req.params.rideId } });
  if (!ride) return res.status(404).json({ error: "Course introuvable." });
  const equipeAutorisee = estEquipe(req.user) && aPermission(req.user, ...AUDIENCES.courses);
  const isParty = equipeAutorisee || req.user.id === ride.clientId || req.user.id === ride.driverId;
  if (!isParty) return res.status(403).json({ error: "Accès refusé." });
  req.ride = ride;
  next();
}

router.get("/:rideId", requireRideParty, async (req, res) => {
  const messages = await prisma.message.findMany({
    where: { rideId: req.params.rideId, ...FIL_DE_COURSE },
    orderBy: { createdAt: "asc" },
    include: { sender: { select: { id: true, name: true, role: true } } },
  });
  res.json(messages);
});

// Un chauffeur ne peut écrire au client qu'à l'approche de la course : à partir de 2 heures avant
// l'heure de prise en charge (demande du propriétaire du 6 octobre 2026 ; 1 heure auparavant), ou
// dès que la course est en cours. Avant cela, il passe par Taxi Sylvain. Le client, lui, peut
// écrire quand il veut. Règle dans lib/fenetres.js, commune avec l'appel masqué.
export function driverMayMessageClient(ride, now = new Date()) {
  return chauffeurPeutContacter(ride, now);
}

router.post("/:rideId", envoiMessages, requireRideParty, async (req, res) => {
  const text = texteDeMessage(req.body?.text);
  if (!text) return res.status(400).json({ error: `Message vide ou trop long (${LONGUEUR_MAX_MESSAGE} caractères au plus).` });

  if (req.user.role === "DRIVER" && !driverMayMessageClient(req.ride)) {
    return res.status(403).json({
      error: `Vous pourrez écrire au client à partir de ${quandLisible(ouvertureContact(req.ride))} (2 heures avant la course). D'ici là, passez par Taxi Sylvain.`,
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
      const room = personalRoom({ id: partyId });
      if (room) io.to(room).emit("message:ride", message);
    }
  }

  const otherPartyId = req.user.id === req.ride.clientId ? req.ride.driverId : req.ride.clientId;
  if (otherPartyId && !estEquipe(req.user)) {
    notifyUser(otherPartyId, { title: `Message de ${req.user.name}`, body: text, data: { type: "message:ride", rideId: req.params.rideId } });
  }
  res.status(201).json(message);
});

export default router;
