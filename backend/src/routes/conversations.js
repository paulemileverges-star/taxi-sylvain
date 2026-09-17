import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { personalRoom } from "../lib/rooms.js";
import { notifyUsers } from "../lib/push.js";

const router = Router();
router.use(requireAuth);

const WITH_PARTICIPANTS = { participants: { include: { user: { select: { id: true, name: true, role: true } } } } };

async function assertParticipant(conversationId, userId) {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  return Boolean(participant);
}

// Créer un groupe de discussion (besoin #6) — le Dispatch choisit un ou plusieurs
// chauffeurs et/ou clients. Le créateur est automatiquement ajouté comme participant.
router.post("/", requirePermission("groups"), async (req, res) => {
  const { name, participantIds } = req.body;
  const ids = Array.isArray(participantIds) ? [...new Set(participantIds)] : [];
  if (ids.length === 0) return res.status(400).json({ error: "Choisissez au moins un correspondant." });

  const allIds = ids.includes(req.user.id) ? ids : [...ids, req.user.id];
  const conversation = await prisma.conversation.create({
    data: {
      name: name || null,
      createdById: req.user.id,
      participants: { create: allIds.map((userId) => ({ userId })) },
    },
    include: WITH_PARTICIPANTS,
  });
  res.status(201).json({ ...conversation, participants: conversation.participants.map((p) => p.user) });
});

// Liste des groupes dont l'utilisateur connecté fait partie
router.get("/", async (req, res) => {
  const conversations = await prisma.conversation.findMany({
    where: { participants: { some: { userId: req.user.id } } },
    include: WITH_PARTICIPANTS,
    orderBy: { createdAt: "desc" },
  });
  res.json(conversations.map((c) => ({ ...c, participants: c.participants.map((p) => p.user) })));
});

router.get("/:id/messages", async (req, res) => {
  const isMember = await assertParticipant(req.params.id, req.user.id);
  if (!isMember && req.user.role !== "DISPATCH") return res.status(403).json({ error: "Accès refusé." });

  const messages = await prisma.groupMessage.findMany({
    where: { conversationId: req.params.id },
    orderBy: { createdAt: "asc" },
    include: { sender: { select: { id: true, name: true, role: true } } },
  });
  res.json(messages);
});

router.post("/:id/messages", async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "Message vide." });

  const isMember = await assertParticipant(req.params.id, req.user.id);
  if (!isMember && req.user.role !== "DISPATCH") return res.status(403).json({ error: "Accès refusé." });

  const message = await prisma.groupMessage.create({
    data: { conversationId: req.params.id, senderId: req.user.id, text },
    include: { sender: { select: { id: true, name: true, role: true } } },
  });

  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId: req.params.id },
    include: { user: { select: { id: true, role: true } } },
  });

  const io = req.app.get("io");
  if (io) {
    const rooms = new Set(participants.map((p) => personalRoom(p.user)).filter(Boolean));
    for (const room of rooms) io.to(room).emit("message:group", { conversationId: req.params.id, message });
  }

  const recipientIds = participants
    .filter((p) => p.user.id !== req.user.id && p.user.role !== "DISPATCH")
    .map((p) => p.user.id);
  notifyUsers(recipientIds, {
    title: `${req.user.name} (groupe)`,
    body: text,
    data: { type: "message:group", conversationId: req.params.id },
  });
  res.status(201).json(message);
});

// Supprimer un groupe de discussion (et tous ses messages) — Dispatch uniquement.
router.delete("/:id", requirePermission("groups"), async (req, res) => {
  const conversation = await prisma.conversation.findUnique({ where: { id: req.params.id } });
  if (!conversation) return res.status(404).json({ error: "Groupe introuvable." });

  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId: conversation.id },
    include: { user: { select: { id: true, role: true } } },
  });

  await prisma.$transaction(async (tx) => {
    await tx.groupMessage.deleteMany({ where: { conversationId: conversation.id } });
    await tx.conversationParticipant.deleteMany({ where: { conversationId: conversation.id } });
    await tx.readMarker.deleteMany({ where: { threadKey: `group:${conversation.id}` } });
    await tx.conversation.delete({ where: { id: conversation.id } });
  });

  const io = req.app.get("io");
  if (io) {
    const rooms = new Set(participants.map((p) => personalRoom(p.user)).filter(Boolean));
    for (const room of rooms) io.to(room).emit("conversation:deleted", { conversationId: conversation.id });
  }
  res.status(204).end();
});

export default router;
