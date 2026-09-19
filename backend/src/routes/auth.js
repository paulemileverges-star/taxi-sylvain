import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { deleteUserCascade, announceDeletion } from "../lib/deleteUser.js";
import { motifDeRefus } from "../lib/accountDeletion.js";

const router = Router();

// Les champs d'identification doivent être du texte. Un nombre ou un objet envoyé à la place
// faisait lever une erreur à bcrypt ou à Prisma, et une seule requête anonyme arrêtait le serveur.
export function isText(value, { max = 500 } = {}) {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyFn: (req) => `${req.ip}|${String(req.body?.email || "").toLowerCase()}`,
});

// Limiteur dédié à la suppression de compte depuis la page web publique : cette route n'exige pas
// de jeton, elle est donc une cible de force brute au même titre que la connexion. Le compteur est
// séparé (préfixe « suppression ») pour qu'un abus ici n'empêche pas la personne de se connecter.
const deleteAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: (req) => `suppression|${req.ip}|${String(req.body?.email || "").toLowerCase()}`,
});

// Inscription publique — uniquement des comptes CLIENT. Les chauffeurs, admins et le Dispatch
// sont créés depuis la console par Taxi Sylvain ; le rôle n'est jamais accepté depuis le client.
router.post("/register", authLimiter, async (req, res) => {
  const { name, email, phone, password } = req.body || {};
  if (!isText(name) || !isText(email) || !isText(phone) || !isText(password)) {
    return res.status(400).json({ error: "Champs manquants." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères." });
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "Ce courriel est déjà utilisé." });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, phone, passwordHash, role: "CLIENT" },
  });

  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

router.post("/login", authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!isText(email) || !isText(password)) return res.status(400).json({ error: "Courriel et mot de passe requis." });
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "Identifiants invalides." });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Identifiants invalides." });

  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

// Profil à jour de l'utilisateur connecté (adresse de domicile, préférences...) — rafraîchi à
// l'ouverture de l'app pour ne pas dépendre d'une copie locale faite à la connexion.
router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: "Compte introuvable." });
  res.json(publicUser(user));
});

// Changement de mot de passe (besoin #6) — pour chauffeur, client ou dispatch, depuis l'app.
router.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!isText(currentPassword) || !isText(newPassword)) {
    return res.status(400).json({ error: "Mot de passe actuel et nouveau mot de passe requis." });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 6 caractères." });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(401).json({ error: "Session invalide ou expirée." });
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Mot de passe actuel incorrect." });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.json({ ok: true });
});

// Suppression définitive de son propre compte, depuis l'application (exigence Google Play).
// Le mot de passe actuel est toujours exigé : personne ne doit pouvoir effacer un compte avec un
// téléphone laissé déverrouillé.
router.post("/delete-account", requireAuth, async (req, res) => {
  const { password } = req.body || {};
  if (!isText(password)) return res.status(400).json({ error: "Mot de passe requis." });

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(401).json({ error: "Session invalide ou expirée." });

  return supprimerCompte(req, res, user, password, "Mot de passe incorrect.");
});

// Même suppression, mais depuis une page web publique : Google Play exige qu'elle soit possible
// sans installer l'application. Pas de jeton, donc courriel + mot de passe, limiteur de tentatives,
// et un message d'échec unique pour ne jamais révéler si un courriel existe chez Taxi Sylvain.
router.post("/delete-account-web", deleteAccountLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!isText(email) || !isText(password)) return res.status(400).json({ error: "Courriel et mot de passe requis." });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "Identifiants invalides." });

  return supprimerCompte(req, res, user, password, "Identifiants invalides.");
});

// Jeton de notification push (Expo) de l'appareil — pour recevoir une alerte (nouvelle course,
// message...) même quand l'app est fermée ou l'écran verrouillé. Un même appareil physique peut
// passer d'un compte à l'autre (chauffeur qui se déconnecte/reconnecte) : on retire donc ce jeton
// de tout autre compte avant de l'attribuer au compte actuellement connecté.
router.post("/push-token", requireAuth, async (req, res) => {
  const { token } = req.body || {};
  if (!isText(token)) return res.status(400).json({ error: "Jeton requis." });

  await prisma.user.updateMany({
    where: { pushToken: token, NOT: { id: req.user.id } },
    data: { pushToken: null },
  });
  // updateMany et non update : si le compte vient d'être supprimé, rien n'est modifié et aucune
  // erreur n'est levée (update levait une erreur qui arrêtait le serveur).
  await prisma.user.updateMany({ where: { id: req.user.id }, data: { pushToken: token } });
  res.json({ ok: true });
});

// À appeler à la déconnexion pour qu'un compte qui n'est plus utilisé sur cet appareil
// n'y reçoive plus de notifications.
router.delete("/push-token", requireAuth, async (req, res) => {
  await prisma.user.updateMany({ where: { id: req.user.id }, data: { pushToken: null } });
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

// Parcours commun aux deux routes de suppression (application et page web) pour que les règles ne
// se dédoublent pas : mot de passe, rôle autorisé, aucune course en cours, puis effacement.
// « erreurMotDePasse » change selon la route : côté web, il ne doit rien révéler sur le courriel.
async function supprimerCompte(req, res, user, password, erreurMotDePasse) {
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: erreurMotDePasse });

  const motif = motifDeRefus(user.role);
  if (motif) return res.status(403).json({ error: motif });

  let result;
  try {
    // La présence d'une course en cours est vérifiée dans la transaction même de la suppression.
    result = await deleteUserCascade(user.id, { refuseIfActive: true });
  } catch (e) {
    if (e.code === "COURSE_EN_COURS" || e.code === "COMPTE_PROTEGE") return res.status(e.status).json({ error: e.message });
    if (e.code === "COMPTE_INTROUVABLE") return res.status(401).json({ error: erreurMotDePasse });
    throw e;
  }

  // Courses à venir annulées ou remises à réaffecter : la console et les chauffeurs sont prévenus.
  announceDeletion(req.app.get("io"), result, user.name);
  res.json({ ok: true });
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name, permissions: user.permissions || [] },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
}

// Ne jamais renvoyer le téléphone d'un chauffeur/client à l'autre partie ailleurs que via
// les routes prévues à cet effet (voir routes/rides.js) — ici c'est l'utilisateur lui-même.
// Le mémo (notes) est réservé au Dispatch : il ne doit jamais partir vers l'application du client.
export function publicUser(user) {
  // eslint-disable-next-line no-unused-vars
  const { passwordHash, notes, pushToken, ...rest } = user;
  return rest;
}

export default router;
