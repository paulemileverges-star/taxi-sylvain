import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { deleteUserCascade } from "../lib/deleteUser.js";
import { generateTempPassword } from "../lib/placeholderEmail.js";

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
  res.status(204).end();
});

export default router;
