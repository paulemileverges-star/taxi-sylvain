import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { motifDeRefus, dateLimite, messageDemandeEnvoyee, texteAlerteDispatch, courrielDemandeRecue, courrielAlerteDispatch } from "../lib/accountDeletion.js";
import { confirmationRequise, demanderCode, verifierCode, messagePourEtat } from "../lib/verification.js";
import { isMailConfigured, sendMail } from "../lib/mailer.js";
import { realEmailOrNull, isPlaceholderEmail } from "../lib/placeholderEmail.js";
import { fermerConnexions } from "../lib/motsDePasse.js";

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

// Audit du 7 octobre 2026 (SEC-04) : la clé du limiteur prenait le courriel en minuscules SANS
// retirer les espaces, alors que la recherche du compte les retire. « paul@x.ca » et « paul@x.ca »
// suivi d'une espace visaient le même compte avec deux compteurs : le blocage se contournait. La clé
// utilise désormais exactement la forme cherchée (normaliserCourriel), et un plafond par adresse IP,
// toutes adresses de courriel confondues, freine l'essai de variantes à grande échelle.
export const cleTentatives = (req) => `${req.ip}|${normaliserCourriel(req.body?.email)}`;
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyFn: cleTentatives,
});
const authLimiterIp = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, keyFn: (req) => `auth-ip|${req.ip}` });
const limiteurConnexion = [authLimiterIp, authLimiter];

// Limiteur dédié à la suppression de compte depuis la page web publique : cette route n'exige pas
// de jeton, elle est donc une cible de force brute au même titre que la connexion. Le compteur est
// séparé (préfixe « suppression ») pour qu'un abus ici n'empêche pas la personne de se connecter.
const deleteAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: (req) => `suppression|${req.ip}|${normaliserCourriel(req.body?.email)}`,
});
const deleteAccountLimiterIp = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, keyFn: (req) => `suppression-ip|${req.ip}` });

// Courriel d'inscription publique : forme plausible, longueur raisonnable, et jamais le domaine
// technique des comptes créés par le Dispatch sans courriel, qui dispense de la confirmation par code
// (audit du 7 octobre 2026, SEC-11). Renvoie un message d'erreur, ou null si le courriel convient.
export function erreurCourrielInscription(email) {
  const e = normaliserCourriel(email);
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "Adresse courriel invalide.";
  if (isPlaceholderEmail(e)) return "Cette adresse courriel ne peut pas être utilisée.";
  return null;
}

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
router.post("/register", limiteurConnexion, async (req, res) => {
  const { name, email, phone, password } = req.body || {};
  if (!isText(name, { max: 120 }) || !isText(email, { max: 254 }) || !isText(phone, { max: 40 }) || !isText(password, { max: 200 })) {
    return res.status(400).json({ error: "Champs manquants." });
  }
  const erreurCourriel = erreurCourrielInscription(email);
  if (erreurCourriel) return res.status(400).json({ error: erreurCourriel });
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

router.post("/login", limiteurConnexion, async (req, res) => {
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
router.post("/verify-email", limiteurConnexion, async (req, res) => {
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
router.post("/resend-code", limiteurConnexion, async (req, res) => {
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

  // Nouveau mot de passe = nouvelle génération de sessions (audit du 7 octobre 2026, SEC-07) : tous
  // les jetons déjà distribués (autres téléphones, session volée) cessent de fonctionner et leurs
  // connexions temps réel sont coupées. Cet appareil reçoit un jeton neuf pour rester connecté.
  const passwordHash = await bcrypt.hash(newPassword, 10);
  const misAJour = await prisma.user.update({ where: { id: user.id }, data: { passwordHash, sessionVersion: { increment: 1 } } });
  fermerConnexions(req.app.get("io"), user.id);
  res.json({ ok: true, token: signToken(misAJour) });
});

// Demande de suppression de son propre compte, depuis l'application (exigence Google Play).
// Décision du propriétaire du 20 septembre 2026 : la suppression n'est plus immédiate, c'est une
// DEMANDE que le Dispatch valide ou refuse (routes/admins.js). Le mot de passe actuel est toujours
// exigé : personne ne doit pouvoir engager cela avec un téléphone laissé déverrouillé.
router.post("/delete-account", requireAuth, async (req, res) => {
  const { password } = req.body || {};
  if (!isText(password)) return res.status(400).json({ error: "Mot de passe requis." });

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(401).json({ error: "Session invalide ou expirée." });

  return demanderSuppression(req, res, user, password, "Mot de passe incorrect.", "app");
});

// Même demande, mais depuis une page web publique : Google Play exige qu'elle soit possible sans
// installer l'application. Pas de jeton, donc courriel + mot de passe, limiteur de tentatives, et
// un message d'échec unique pour ne jamais révéler si un courriel existe chez Taxi Sylvain.
router.post("/delete-account-web", deleteAccountLimiterIp, deleteAccountLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!isText(email) || !isText(password)) return res.status(400).json({ error: "Courriel et mot de passe requis." });

  const user = await chercherParCourriel(prisma, email);
  if (!user) return res.status(401).json({ error: "Identifiants invalides." });

  return demanderSuppression(req, res, user, password, "Identifiants invalides.", "web");
});

// La personne change d'avis tant que le Dispatch n'a pas tranché : la demande est retirée.
router.post("/cancel-deletion", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, name: true, deletionRequestedAt: true } });
  if (!user) return res.status(401).json({ error: "Session invalide ou expirée." });
  if (user.deletionRequestedAt) {
    await prisma.user.update({ where: { id: user.id }, data: { deletionRequestedAt: null, deletionRequestVia: null } });
    const io = req.app.get("io");
    io?.to("dispatch").emit("ride:notification", { text: `${user.name} a annulé sa demande de suppression de compte.` });
    io?.to("dispatch").emit("account:deletion-changed", { userId: user.id });
  }
  res.json({ ok: true });
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

// Parcours commun aux deux routes (application et page web) pour que les règles ne se dédoublent
// pas : mot de passe, rôle autorisé, puis enregistrement de la demande. Le compte reste actif ; la
// vérification « aucune course en cours » se fait au moment où le Dispatch valide (deleteUser.js).
// « erreurMotDePasse » change selon la route : côté web, il ne doit rien révéler sur le courriel.
async function demanderSuppression(req, res, user, password, erreurMotDePasse, via) {
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: erreurMotDePasse });

  const motif = motifDeRefus(user.role);
  if (motif) return res.status(403).json({ error: motif });

  // Une demande déjà en attente n'est pas dédoublée : même réponse, sans nouvelle alerte.
  let requestedAt = user.deletionRequestedAt;
  if (!requestedAt) {
    requestedAt = new Date();
    await prisma.user.update({ where: { id: user.id }, data: { deletionRequestedAt: requestedAt, deletionRequestVia: via } });
    const io = req.app.get("io");
    io?.to("dispatch").emit("ride:notification", { text: texteAlerteDispatch({ name: user.name, role: user.role, via }) });
    io?.to("dispatch").emit("account:deletion-changed", { userId: user.id });
    envoyerCourrielsDemande(user, requestedAt, via);
  }
  res.json({ ok: true, pending: true, requestedAt, deadline: dateLimite(requestedAt), message: messageDemandeEnvoyee() });
}

// Accusé de réception à la personne et alerte aux comptes Dispatch. Jamais bloquant.
async function envoyerCourrielsDemande(user, requestedAt, via) {
  if (!isMailConfigured()) return;
  try {
    const adresse = realEmailOrNull(user.email);
    if (adresse) await sendMail({ to: adresse, toName: user.name, ...courrielDemandeRecue({ nom: user.name, requestedAt }) });
    const dispatchs = await prisma.user.findMany({ where: { role: "DISPATCH" }, select: { name: true, email: true } });
    for (const d of dispatchs) {
      const a = realEmailOrNull(d.email);
      if (a) await sendMail({ to: a, toName: d.name, ...courrielAlerteDispatch({ name: user.name, role: user.role, via, requestedAt }) });
    }
  } catch (e) {
    console.error("Courriels de demande de suppression non envoyés :", e.message);
  }
}

// « sv » : génération de sessions du compte au moment de la connexion (voir middleware/auth.js).
export function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name, permissions: user.permissions || [], sv: user.sessionVersion ?? 0 },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
}

// Ne jamais renvoyer le téléphone d'un chauffeur/client à l'autre partie ailleurs que via
// les routes prévues à cet effet (voir routes/rides.js) — ici c'est l'utilisateur lui-même.
// Le mémo (notes) est réservé au Dispatch : il ne doit jamais partir vers l'application du client.
export function publicUser(user) {
  // eslint-disable-next-line no-unused-vars
  const { passwordHash, notes, pushToken, sessionVersion, ...rest } = user;
  return rest;
}

export default router;
