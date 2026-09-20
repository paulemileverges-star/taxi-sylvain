import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { deleteUserCascade, announceDeletion } from "../lib/deleteUser.js";
import { motifDeRefus, courseEnCoursBloque } from "../lib/accountDeletion.js";
import { confirmationRequise, demanderCode, verifierCode, messagePourEtat } from "../lib/verification.js";

const router = Router();

// Les champs d'identification doivent être du texte. Un nombre ou un objet envoyé à la place
// faisait lever une erreur à bcrypt ou à Prisma, et une seule requête anonyme arrêtait le serveur.
// Un courriel tapé sur un téléphone commence souvent par une majuscule, et le correcteur en ajoute.
// « Paul@exemple.ca » et « paul@exemple.ca » sont la même adresse : on la range en minuscules à
// l'inscription, et on la cherche sans tenir compte de la casse, pour que les comptes déjà
// enregistrés avec des majuscules continuent de fonctionner. Sans cela, un client s'inscrirait
// deux fois, ou ne pourrait plus se connecter.
export function normaliserCourriel(value) {
  return String(value || "").trim().toLowerCase();
}

export function chercherParCourriel(db, email) {
  return db.user.findFirst({ where: { email: { equals: String(email || "").trim(), mode: "insensitive" } } });
}

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

// Message montré quand un code vient d'être demandé (ou pas), selon le résultat de l'envoi.
export function messageDemandeDeCode(envoi, email) {
  if (envoi?.envoye) return `Un code de confirmation à six chiffres vient d'être envoyé à ${email}. Saisissez-le pour continuer.`;
  if (envoi?.raison === "trop-tot") return "Un code vous a déjà été envoyé il y a moins d'une minute. Vérifiez votre boîte de courriel, y compris les indésirables.";
  return "Le courriel de confirmation n'a pas pu être envoyé. Réessayez dans un instant, ou appelez Taxi Sylvain.";
}

// Fin commune de l'inscription et de la connexion (demande du propriétaire du 20 septembre 2026 :
// « confirmation de code envoyé par courriel » pour les nouveaux comptes chauffeurs et clients).
// Tant que le courriel n'est pas confirmé, AUCUN jeton ne part : le compte existe, mais il n'ouvre
// rien. Sans service de courriel, ou sans vrai courriel (réservation par téléphone), le compte est
// confirmé d'office pour ne bloquer personne, et on le note pour que l'activation future des
// courriels ne bloque pas ce compte rétroactivement.
async function ouvrirSession(user, res, { statutSiCode = 403, statutSiJeton = 200 } = {}) {
  if (confirmationRequise(user)) {
    const envoi = await demanderCode(user);
    return res.status(statutSiCode).json({
      verificationRequired: true,
      email: user.email,
      error: messageDemandeDeCode(envoi, user.email),
    });
  }
  if (!user.emailVerifiedAt) {
    await prisma.user.updateMany({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  }
  const token = signToken(user);
  return res.status(statutSiJeton).json({ token, user: publicUser(user) });
}

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
  const existing = await chercherParCourriel(prisma, email);
  if (existing) return res.status(409).json({ error: "Ce courriel est déjà utilisé." });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name: name.trim(), email: normaliserCourriel(email), phone: phone.trim(), passwordHash, role: "CLIENT" },
  });

  // Compte créé : réponse 201 dans les deux cas (jeton, ou code à saisir).
  return ouvrirSession(user, res, { statutSiCode: 201, statutSiJeton: 201 });
});

router.post("/login", authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!isText(email) || !isText(password)) return res.status(400).json({ error: "Courriel et mot de passe requis." });
  const user = await chercherParCourriel(prisma, email);
  if (!user) return res.status(401).json({ error: "Identifiants invalides." });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Identifiants invalides." });

  // Un chauffeur ou un client créé par le Dispatch reçoit son code ici, à sa première connexion.
  return ouvrirSession(user, res);
});

// Saisie du code reçu par courriel. Le mot de passe est redemandé : le code seul ne doit jamais
// suffire à ouvrir un compte, et l'application l'a encore sous la main à ce moment-là.
router.post("/verify-email", authLimiter, async (req, res) => {
  const { email, password, code } = req.body || {};
  if (!isText(email) || !isText(password) || !isText(code, { max: 12 })) {
    return res.status(400).json({ error: "Courriel, mot de passe et code requis." });
  }
  const user = await chercherParCourriel(prisma, email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: "Identifiants invalides." });

  if (!user.emailVerifiedAt) {
    const etat = await verifierCode(user, code);
    if (etat !== "valide") return res.status(400).json({ error: messagePourEtat(etat), etat });
    user.emailVerifiedAt = new Date();
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

// Nouveau code (bouton « Renvoyer le code »). Même garde-fou : courriel ET mot de passe, pour que
// personne ne puisse faire pleuvoir des courriels sur une adresse qui n'est pas la sienne.
router.post("/resend-code", authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!isText(email) || !isText(password)) return res.status(400).json({ error: "Courriel et mot de passe requis." });
  const user = await chercherParCourriel(prisma, email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: "Identifiants invalides." });

  if (!confirmationRequise(user)) return res.json({ ok: true, dejaConfirme: true, message: "Ce courriel est déjà confirmé : connectez-vous." });
  const envoi = await demanderCode(user);
  res.json({ ok: Boolean(envoi.envoye), message: messageDemandeDeCode(envoi, user.email) });
});

// Porte de secours du Dispatch : confirmer un courriel à la main (code jamais reçu, adresse
// corrigée après coup, personne au téléphone). Le compte peut ensuite se connecter sans code.
router.post("/confirm-email/:userId", requireAuth, requireRole("DISPATCH"), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { id: true, emailVerifiedAt: true } });
  if (!user) return res.status(404).json({ error: "Compte introuvable." });
  await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: user.emailVerifiedAt || new Date() } });
  await prisma.emailVerification.deleteMany({ where: { userId: user.id } });
  res.json({ ok: true });
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

  const user = await chercherParCourriel(prisma, email);
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
// se dédoublent pas : mot de passe, rôle autorisé, aucune course en cours (client seulement),
// puis effacement.
// « erreurMotDePasse » change selon la route : côté web, il ne doit rien révéler sur le courriel.
async function supprimerCompte(req, res, user, password, erreurMotDePasse) {
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: erreurMotDePasse });

  const motif = motifDeRefus(user.role);
  if (motif) return res.status(403).json({ error: motif });

  let result;
  try {
    // Client : la présence d'une course en cours est vérifiée dans la transaction même de la
    // suppression. Chauffeur : aucune vérification, ses courses repartent chez le Dispatch.
    result = await deleteUserCascade(user.id, { refuseIfActive: courseEnCoursBloque(user.role) });
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
