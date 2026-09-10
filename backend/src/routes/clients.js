import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { deleteUserCascade } from "../lib/deleteUser.js";
import { streamListPdf, streamListXlsx } from "../lib/exportReport.js";
import { realEmailOrNull, generateTempPassword } from "../lib/placeholderEmail.js";

const router = Router();
router.use(requireAuth);
router.use(requireRole("DISPATCH"));

router.get("/", async (req, res) => {
  const clients = await prisma.user.findMany({
    where: { role: "CLIENT" },
    select: { id: true, name: true, email: true, phone: true, address: true, ratingAvg: true, createdAt: true, notes: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(clients.map((c) => ({ ...c, email: realEmailOrNull(c.email) })));
});

// Créer un compte client indépendamment d'une course — pour bâtir une base de clients que le
// Dispatch peut ensuite choisir dans le menu déroulant "Client" au moment de créer une course.
// Le mot de passe est optionnel : s'il n'est pas fourni, le système en génère un automatiquement
// et le renvoie une seule fois en clair (tempPassword) pour que le Dispatch puisse le copier et
// le transmettre au client — celui-ci pourra le changer lui-même une fois connecté.
router.post("/", async (req, res) => {
  const { name, email, phone, address, notes, password } = req.body;
  if (!name || !phone) return res.status(400).json({ error: "Nom et téléphone sont requis." });

  const finalEmail = email || `client-${crypto.randomBytes(6).toString("hex")}@reservation.taxisylvain.local`;
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: finalEmail }, { role: "CLIENT", phone } ] },
  });
  if (existing) return res.status(409).json({ error: "Un client avec ce courriel ou ce téléphone existe déjà." });

  const tempPassword = password || generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const client = await prisma.user.create({
    data: { role: "CLIENT", name, email: finalEmail, phone, address: address || null, notes: notes || null, passwordHash },
    select: { id: true, name: true, email: true, phone: true, address: true, ratingAvg: true, createdAt: true, notes: true },
  });
  res.status(201).json({ ...client, email: realEmailOrNull(client.email), tempPassword });
});

// Mémo et préférences du Dispatch sur un client — jamais exposé au client lui-même.
router.patch("/:id/notes", async (req, res) => {
  const { notes } = req.body;
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.role !== "CLIENT") return res.status(404).json({ error: "Client introuvable." });

  const client = await prisma.user.update({
    where: { id: req.params.id },
    data: { notes: notes ?? null },
    select: { id: true, notes: true },
  });
  res.json(client);
});

// Adresse du client, modifiable depuis la fiche client du Dispatch.
router.patch("/:id/address", async (req, res) => {
  const { address } = req.body;
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.role !== "CLIENT") return res.status(404).json({ error: "Client introuvable." });

  const client = await prisma.user.update({
    where: { id: req.params.id },
    data: { address: address ?? null },
    select: { id: true, address: true },
  });
  res.json(client);
});

// Export de la base de clients (PDF ou Excel) — pour garder une copie hors-ligne des coordonnées.
// Les champs sans donnée réelle (ex. courriel technique généré automatiquement) sont exportés
// vides plutôt que de montrer une information fictive.
router.get("/export", async (req, res) => {
  const format = req.query.format === "xlsx" ? "xlsx" : "pdf";
  const clients = await prisma.user.findMany({
    where: { role: "CLIENT" },
    select: { name: true, email: true, phone: true, address: true, ratingAvg: true, createdAt: true, notes: true },
    orderBy: { name: "asc" },
  });

  const rows = clients.map((c) => ({
    name: c.name,
    email: realEmailOrNull(c.email) || "",
    phone: c.phone,
    address: c.address || "",
    ratingAvg: c.ratingAvg?.toFixed(1) ?? "5.0",
    createdAt: new Date(c.createdAt).toLocaleDateString("fr-CA"),
    notes: c.notes || "",
  }));
  const columns = [
    { key: "name", label: "Nom", width: 130 },
    { key: "email", label: "Courriel", width: 180 },
    { key: "phone", label: "Téléphone", width: 100 },
    { key: "address", label: "Adresse", width: 180 },
    { key: "ratingAvg", label: "Note", width: 50 },
    { key: "createdAt", label: "Client depuis", width: 90 },
    { key: "notes", label: "Mémo et préférences", width: 200 },
  ];

  if (format === "xlsx") {
    await streamListXlsx(res, { title: "Clients Taxi Sylvain", filename: "clients-taxi-sylvain", columns, rows });
  } else {
    streamListPdf(res, { title: "Taxi Sylvain — Liste des clients", filename: "clients-taxi-sylvain", columns, rows });
  }
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
