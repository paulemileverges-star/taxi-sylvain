import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { deleteUserCascade } from "../lib/deleteUser.js";
import { generateTempPassword, realEmailOrNull } from "../lib/placeholderEmail.js";
import { isMailConfigured, mailProvider, parseFrom, sendMail } from "../lib/mailer.js";

// Gestion des comptes Admin (besoin #20) — des collaborateurs que Taxi Sylvain (Dispatch) crée
// lui-même pour l'aider à gérer la plateforme, avec un accès limité aux fonctionnalités qu'il
// choisit. Seul le compte Dispatch (le propriétaire) peut créer, modifier ou supprimer un admin —
// jamais un autre admin, pour éviter qu'un collaborateur s'octroie plus d'accès que prévu.
export const PERMISSIONS = [
  { key: "courses", label: "Courses" },
  { key: "schedule", label: "Cédule" },
  { key: "drivers", label: "Chauffeurs" },
  { key: "clients", label: "Clients" },
  { key: "reports", label: "Rapports" },
  { key: "groups", label: "Messagerie / Groupes" },
];
const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

const router = Router();
router.use(requireAuth);
router.use(requireRole("DISPATCH"));

router.get("/", async (req, res) => {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true, name: true, email: true, phone: true, permissions: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(admins);
});

router.post("/", async (req, res) => {
  const { name, email, phone, password, permissions } = req.body;
  if (!name || !email || !phone) return res.status(400).json({ error: "Nom, courriel et téléphone sont requis." });

  const perms = Array.isArray(permissions) ? permissions.filter((p) => PERMISSION_KEYS.includes(p)) : [];

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "Ce courriel est déjà utilisé." });

  const tempPassword = password || generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const admin = await prisma.user.create({
    data: { role: "ADMIN", name, email, phone, passwordHash, permissions: perms },
    select: { id: true, name: true, email: true, phone: true, permissions: true, createdAt: true },
  });
  res.status(201).json({ ...admin, tempPassword });
});

router.patch("/:id/permissions", async (req, res) => {
  const { permissions } = req.body;
  const perms = Array.isArray(permissions) ? permissions.filter((p) => PERMISSION_KEYS.includes(p)) : [];
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.role !== "ADMIN") return res.status(404).json({ error: "Compte admin introuvable." });

  const admin = await prisma.user.update({
    where: { id: req.params.id },
    data: { permissions: perms },
    select: { id: true, permissions: true },
  });
  res.json(admin);
});

router.delete("/:id", async (req, res) => {
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.role !== "ADMIN") return res.status(404).json({ error: "Compte admin introuvable." });
  await deleteUserCascade(req.params.id);
  // Ses connexions en temps réel encore ouvertes (console, carte en direct) sont coupées.
  req.app.get("io")?.in(`user:${req.params.id}`).disconnectSockets(true);
  res.status(204).end();
});


// État des courriels automatiques et essai d'envoi — pour que Taxi Sylvain vérifie lui-même,
// depuis la console, que la clé du fournisseur est bien en place, sans avoir à lire des journaux.
router.get("/email-status", (req, res) => {
  const from = parseFrom();
  res.json({ configured: isMailConfigured(), provider: mailProvider(), from: from?.email || null });
});

router.post("/email-test", async (req, res) => {
  if (!isMailConfigured()) {
    return res.status(503).json({
      error: "Les courriels ne sont pas configurés. Ajoutez BREVO_API_KEY (ou RESEND_API_KEY) et MAIL_FROM dans les variables du serveur.",
    });
  }
  const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true, email: true } });
  const to = realEmailOrNull(req.body?.to || me?.email);
  if (!to) return res.status(400).json({ error: "Aucune adresse de destination valide." });

  const result = await sendMail({
    to,
    toName: me?.name,
    subject: "Test d'envoi — Taxi Sylvain",
    html: "<p>Cet essai confirme que les courriels automatiques de Taxi Sylvain fonctionnent.</p>",
    text: "Cet essai confirme que les courriels automatiques de Taxi Sylvain fonctionnent.",
  });
  if (!result.ok) return res.status(502).json({ error: `Envoi refusé par le fournisseur : ${result.error}` });
  res.json({ ok: true, to });
});

export default router;
