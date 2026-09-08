import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

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

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name },
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
