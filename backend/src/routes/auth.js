import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Inscription — le rôle DISPATCH ne devrait être créé qu'à la main (compte admin Taxi Sylvain)
router.post("/register", async (req, res) => {
  const { name, email, phone, password, role, carModel, plate } = req.body;
  if (!name || !email || !phone || !password || !role) {
    return res.status(400).json({ error: "Champs manquants." });
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "Ce courriel est déjà utilisé." });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, phone, passwordHash, role, carModel, plate },
  });

  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "Identifiants invalides." });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Identifiants invalides." });

  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

// Changement de mot de passe (besoin #6) — pour chauffeur, client ou dispatch, depuis l'app.
router.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Mot de passe actuel et nouveau mot de passe requis." });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 6 caractères." });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Mot de passe actuel incorrect." });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.json({ ok: true });
});

// Jeton de notification push (Expo) de l'appareil — pour recevoir une alerte (nouvelle course,
// message...) même quand l'app est fermée ou l'écran verrouillé. Un même appareil physique peut
// passer d'un compte à l'autre (chauffeur qui se déconnecte/reconnecte) : on retire donc ce jeton
// de tout autre compte avant de l'attribuer au compte actuellement connecté.
router.post("/push-token", requireAuth, async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "Jeton requis." });

  await prisma.user.updateMany({
    where: { pushToken: token, NOT: { id: req.user.id } },
    data: { pushToken: null },
  });
  await prisma.user.update({ where: { id: req.user.id }, data: { pushToken: token } });
  res.json({ ok: true });
});

// À appeler à la déconnexion pour qu'un compte qui n'est plus utilisé sur cet appareil
// n'y reçoive plus de notifications.
router.delete("/push-token", requireAuth, async (req, res) => {
  await prisma.user.update({ where: { id: req.user.id }, data: { pushToken: null } });
  res.json({ ok: true });
});

// Préférences de rappel de course (besoin #1) — décalages en minutes avant l'heure de prise en
// charge auxquels le chauffeur ou le client veut être notifié. Par défaut : 1h avant et 10min avant.
const ALLOWED_OFFSETS = [1440, 120, 60, 30, 10];
router.patch("/notification-prefs", requireAuth, async (req, res) => {
  const offsets = Array.isArray(req.body.offsets) ? req.body.offsets : null;
  if (!offsets || offsets.some((o) => !ALLOWED_OFFSETS.includes(o))) {
    return res.status(400).json({ error: "Décalages invalides." });
  }
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { reminderOffsets: [...new Set(offsets)] },
    select: { reminderOffsets: true },
  });
  res.json(user);
});

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name, permissions: user.permissions || [] },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
}

// Ne jamais renvoyer le téléphone d'un chauffeur/client à l'autre partie ailleurs que via
// les routes prévues à cet effet (voir routes/rides.js) — ici c'est l'utilisateur lui-même.
function publicUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

export default router;
