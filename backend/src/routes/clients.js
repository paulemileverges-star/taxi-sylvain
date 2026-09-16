import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { deleteUserCascade } from "../lib/deleteUser.js";
import { streamListPdf, streamListXlsx } from "../lib/exportReport.js";
import { realEmailOrNull, generateTempPassword } from "../lib/placeholderEmail.js";
import { parseImportFile, pick } from "../lib/bulkImport.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();
router.use(requireAuth);
router.use(requirePermission("clients"));

async function createClientAccount({ name, email, phone, address, notes, password }) {
  if (!name || !phone) {
    const err = new Error("Nom et téléphone sont requis.");
    err.status = 400;
    throw err;
  }
  const finalEmail = email || `client-${crypto.randomBytes(6).toString("hex")}@reservation.taxisylvain.local`;
  const existing = await prisma.user.findFirst({ where: { OR: [{ email: finalEmail }, { role: "CLIENT", phone }] } });
  if (existing) {
    const err = new Error("Un client avec ce courriel ou ce téléphone existe déjà.");
    err.status = 409;
    throw err;
  }
  const tempPassword = password || generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const client = await prisma.user.create({
    data: { role: "CLIENT", name, email: finalEmail, phone, address: address || null, notes: notes || null, passwordHash },
    select: { id: true, name: true, email: true, phone: true, address: true, ratingAvg: true, createdAt: true, notes: true },
  });
  return { client, tempPassword };
}

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
  try {
    const { client, tempPassword } = await createClientAccount(req.body);
    res.status(201).json({ ...client, email: realEmailOrNull(client.email), tempPassword });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Import en masse depuis un fichier .xlsx ou .csv (besoin #2) — colonnes reconnues : Nom,
// Courriel, Téléphone, Adresse, Mémo/Préférences (accents et casse ignorés). Les lignes en
// double (même téléphone) ou invalides (nom/téléphone manquant) sont ignorées sans bloquer
// le reste de l'import ; le détail est renvoyé pour que le Dispatch sache quoi corriger.
router.post("/import", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu." });

  let rows;
  try {
    rows = await parseImportFile(req.file);
  } catch (e) {
    return res.status(400).json({ error: "Fichier illisible. Utilisez un export .xlsx ou .csv avec une ligne d'en-têtes." });
  }

  const created = [];
  const skipped = [];
  for (const row of rows) {
    const name = pick(row, "nom", "name");
    const phone = pick(row, "telephone", "téléphone", "phone");
    if (!name || !phone) { skipped.push({ row, reason: "Nom ou téléphone manquant." }); continue; }
    try {
      const { client } = await createClientAccount({
        name,
        phone,
        email: pick(row, "courriel", "email") || undefined,
        address: pick(row, "adresse", "address") || undefined,
        notes: pick(row, "memo", "mémo et préférences", "notes", "preferences", "préférences") || undefined,
      });
      created.push(client.name);
    } catch (e) {
      skipped.push({ row, reason: e.message });
    }
  }
  res.json({ createdCount: created.length, skippedCount: skipped.length, skipped });
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

// Modification d'une fiche client (bouton « Modifier » du Dispatch).
router.patch("/:id", async (req, res) => {
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.role !== "CLIENT") return res.status(404).json({ error: "Client introuvable." });

  const { name, email, phone, address, notes } = req.body;
  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (phone !== undefined) data.phone = String(phone).trim();
  if (address !== undefined) data.address = address ? String(address).trim() : null;
  if (notes !== undefined) data.notes = notes ? String(notes).trim() : null;
  if (email !== undefined) {
    const trimmed = String(email || "").trim();
    // Courriel vide : on garde le courriel technique existant (jamais affiché) pour l'unicité.
    if (trimmed && trimmed !== existing.email) {
      const taken = await prisma.user.findUnique({ where: { email: trimmed } });
      if (taken) return res.status(409).json({ error: "Ce courriel est déjà utilisé par un autre compte." });
      data.email = trimmed;
    }
  }
  if (data.name === "" || data.phone === "") return res.status(400).json({ error: "Nom et téléphone sont requis." });

  const client = await prisma.user.update({
    where: { id: req.params.id },
    data,
    select: { id: true, name: true, email: true, phone: true, address: true, ratingAvg: true, createdAt: true, notes: true },
  });
  res.json({ ...client, email: realEmailOrNull(client.email) });
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
