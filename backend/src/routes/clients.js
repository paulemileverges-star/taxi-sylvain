import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { deleteUserCascade, announceDeletion } from "../lib/deleteUser.js";
import { streamListPdf, streamListXlsx } from "../lib/exportReport.js";
import { realEmailOrNull, generateTempPassword } from "../lib/placeholderEmail.js";
import { parseImportFile, pick } from "../lib/bulkImport.js";
import { quoteAll, clientPriceData, parsePrice } from "../lib/pricing.js";
import { cleanAddressText } from "../lib/addressFormat.js";
import { aPermission } from "../lib/equipe.js";
import { reinitialiserMotDePasse } from "../lib/motsDePasse.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();
router.use(requireAuth);
router.use(requirePermission("clients"));

// L'argent reste sous la permission « courses » : un collaborateur autorisé aux clients peut créer ou
// corriger une fiche, pas fixer un prix. Même règle à la création, à l'import et à la modification
// (audit du 7 octobre 2026, SEC-17 : seule la modification était contrôlée).
const peutFixerLesPrix = (user) => aPermission(user, "courses");
const PRIX = ["priceYUL", "priceYHU", "priceREM"];
const prixFournis = (source) => PRIX.some((k) => source?.[k] !== undefined && source[k] !== null && String(source[k]).trim() !== "");
const REFUS_PRIX = { error: "Seul un compte autorisé aux Courses peut fixer les tarifs d'un client." };

async function createClientAccount({ name, email, phone, address, notes, password, priceYUL, priceYHU, priceREM }) {
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
    data: {
      role: "CLIENT", name, email: finalEmail, phone, address: cleanAddressText(address), notes: notes || null, passwordHash,
      // Un vrai courriel sera confirmé par code à la première connexion (lib/verification.js).
      emailVerifiedAt: realEmailOrNull(finalEmail) ? null : new Date(),
      priceYUL: parsePrice(priceYUL), priceYHU: parsePrice(priceYHU), priceREM: parsePrice(priceREM),
    },
    select: { id: true, name: true, email: true, phone: true, address: true, ratingAvg: true, createdAt: true, notes: true, priceYUL: true, priceYHU: true, priceREM: true },
  });
  return { client, tempPassword };
}

// Liste des clients, avec pour chacun le prix d'une course depuis son adresse vers les trois
// destinations habituelles (YUL, YHU, REM) — calculé à partir de la grille tarifaire.
router.get("/", async (req, res) => {
  const [clients, destinations, zones] = await Promise.all([
    prisma.user.findMany({
      where: { role: "CLIENT" },
      select: { id: true, name: true, email: true, phone: true, address: true, ratingAvg: true, createdAt: true, notes: true, priceYUL: true, priceYHU: true, priceREM: true, emailVerifiedAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.destination.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.priceZone.findMany(),
  ]);

  res.json(
    clients.map((c) => {
      const { prices, zoneName, sources } = quoteAll(c.address, destinations, zones, c);
      return { ...c, email: realEmailOrNull(c.email), prices, zoneName, sources };
    })
  );
});

// Créer un compte client indépendamment d'une course — pour bâtir une base de clients que le
// Dispatch peut ensuite choisir dans le menu déroulant "Client" au moment de créer une course.
// Le mot de passe est optionnel : s'il n'est pas fourni, le système en génère un automatiquement
// et le renvoie une seule fois en clair (tempPassword) pour que le Dispatch puisse le copier et
// le transmettre au client — celui-ci pourra le changer lui-même une fois connecté.
router.post("/", async (req, res) => {
  if (prixFournis(req.body) && !peutFixerLesPrix(req.user)) return res.status(403).json(REFUS_PRIX);
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

  // Des prix dans le fichier exigent le droit de fixer les tarifs : refus franc plutôt qu'un import
  // qui les ignorerait en silence.
  const prixDeLigne = (row) => ({
    priceYUL: pick(row, "prix yul", "tarif yul", "yul"),
    priceYHU: pick(row, "prix yhu", "tarif yhu", "yhu"),
    priceREM: pick(row, "prix rem", "tarif rem", "rem"),
  });
  if (!peutFixerLesPrix(req.user) && rows.some((row) => prixFournis(prixDeLigne(row)))) {
    return res.status(403).json({ error: "Ce fichier contient des prix. Seul un compte autorisé aux Courses peut les importer : retirez les colonnes de prix ou demandez ce droit." });
  }

  const created = [];
  const skipped = [];
  for (const row of rows) {
    const name = pick(row, "nom", "name");
    const phone = pick(row, "telephone", "téléphone", "phone");
    if (!name || !phone) { skipped.push({ row, reason: "Nom ou téléphone manquant." }); continue; }
    try {
      const { client, tempPassword } = await createClientAccount({
        name,
        phone,
        email: pick(row, "courriel", "email") || undefined,
        address: pick(row, "adresse", "address") || undefined,
        notes: pick(row, "memo", "mémo et préférences", "notes", "preferences", "préférences") || undefined,
        ...prixDeLigne(row),
      });
      created.push({ id: client.id, name: client.name, phone: client.phone, email: realEmailOrNull(client.email), tempPassword });
    } catch (e) {
      skipped.push({ row, reason: e.message });
    }
  }
  // Les mots de passe temporaires ne sont montrés qu'ici, une seule fois : sans eux, les comptes
  // importés restaient inaccessibles (audit du 7 octobre 2026, B05).
  res.json({ createdCount: created.length, skippedCount: skipped.length, skipped, created });
});

// Nouveau mot de passe temporaire pour un client qui a perdu le sien, ou créé par import (audit du
// 7 octobre 2026, B05) : montré une seule fois, et toutes ses sessions ouvertes sont fermées.
router.post("/:id/reset-password", async (req, res) => {
  const resultat = await reinitialiserMotDePasse(String(req.params.id), "CLIENT", req.app.get("io"));
  if (!resultat) return res.status(404).json({ error: "Client introuvable." });
  res.json(resultat);
});

// Mémo et préférences du Dispatch sur un client — jamais exposé au client lui-même.
router.patch("/:id/notes", async (req, res) => {
  const notes = typeof req.body?.notes === "string" ? req.body.notes.trim().slice(0, 5000) : null;
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.role !== "CLIENT") return res.status(404).json({ error: "Client introuvable." });

  const client = await prisma.user.update({
    where: { id: req.params.id },
    data: { notes: notes || null },
    select: { id: true, notes: true },
  });
  res.json(client);
});

// Modification d'une fiche client (bouton « Modifier » du Dispatch).
router.patch("/:id", async (req, res) => {
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.role !== "CLIENT") return res.status(404).json({ error: "Client introuvable." });

  const { name, email, phone, address, notes } = req.body;
  // L'argent reste sous la permission « courses » : un collaborateur autorisé aux clients peut
  // corriger une fiche, pas fixer un prix. Un refus franc plutôt qu'une saisie ignorée en silence.
  const { data: prixData, forbidden } = clientPriceData(req.body, existing, peutFixerLesPrix(req.user));
  if (forbidden) return res.status(403).json({ error: "Seul un compte autorisé aux Courses peut modifier les tarifs d'un client." });
  const data = { ...prixData };
  if (name !== undefined) data.name = String(name).trim();
  if (phone !== undefined) data.phone = String(phone).trim();
  if (address !== undefined) data.address = cleanAddressText(address);
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
    select: { id: true, name: true, email: true, phone: true, address: true, ratingAvg: true, createdAt: true, notes: true, priceYUL: true, priceYHU: true, priceREM: true },
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
    data: { address: cleanAddressText(address) },
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
    select: { name: true, email: true, phone: true, address: true, ratingAvg: true, createdAt: true, notes: true, priceYUL: true, priceYHU: true, priceREM: true },
    orderBy: { name: "asc" },
  });

  const rows = clients.map((c) => ({
    name: c.name,
    email: realEmailOrNull(c.email) || "",
    phone: c.phone,
    address: c.address || "",
    ratingAvg: c.ratingAvg != null ? c.ratingAvg.toFixed(1) : "Aucune note",
    createdAt: new Date(c.createdAt).toLocaleDateString("fr-CA"),
    priceYUL: c.priceYUL != null ? c.priceYUL.toFixed(2) : "",
    priceYHU: c.priceYHU != null ? c.priceYHU.toFixed(2) : "",
    priceREM: c.priceREM != null ? c.priceREM.toFixed(2) : "",
    notes: c.notes || "",
  }));
  const columns = [
    { key: "name", label: "Nom", width: 130 },
    { key: "email", label: "Courriel", width: 180 },
    { key: "phone", label: "Téléphone", width: 100 },
    { key: "address", label: "Adresse", width: 180 },
    { key: "ratingAvg", label: "Note", width: 50 },
    { key: "createdAt", label: "Client depuis", width: 90 },
    { key: "priceYUL", label: "Prix YUL ($)", width: 70 },
    { key: "priceYHU", label: "Prix YHU ($)", width: 70 },
    { key: "priceREM", label: "Prix REM ($)", width: 70 },
    { key: "notes", label: "Mémo et préférences", width: 200 },
  ];

  if (format === "xlsx") {
    await streamListXlsx(res, { title: "Clients Taxi Sylvain", filename: "clients-taxi-sylvain", columns, rows });
  } else {
    streamListPdf(res, { title: "Taxi Sylvain — Liste des clients", filename: "clients-taxi-sylvain", columns, rows });
  }
});

// Suppression d'un client depuis la console. Seul un compte CLIENT peut être visé ici : cette
// route ne doit jamais pouvoir effacer le compte Dispatch, un administrateur ou un chauffeur.
router.delete("/:id", async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: String(req.params.id) }, select: { role: true, name: true } });
  if (!target || target.role !== "CLIENT") return res.status(404).json({ error: "Client introuvable." });
  const result = await deleteUserCascade(req.params.id);
  announceDeletion(req.app.get("io"), result, target.name);
  res.status(204).end();
});

export default router;
