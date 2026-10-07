import "dotenv/config";
// En tout premier, avant les routes : voir lib/httpSafety.js.
import { installErrorHandler, installProcessGuards } from "./lib/httpSafety.js";
import express from "express";
import cors from "cors";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import cron from "node-cron";

import authRoutes from "./routes/auth.js";
import rideRoutes from "./routes/rides.js";
import messageRoutes from "./routes/messages.js";
import ratingRoutes from "./routes/ratings.js";
import driverRoutes from "./routes/drivers.js";
import reportRoutes from "./routes/reports.js";
import scheduleRoutes from "./routes/schedule.js";
import clientRoutes from "./routes/clients.js";
import conversationRoutes from "./routes/conversations.js";
import geocodeRoutes from "./routes/geocode.js";
import adminRoutes from "./routes/admins.js";
import destinationRoutes from "./routes/destinations.js";
import pricingRoutes from "./routes/pricing.js";
import suggestionRoutes from "./routes/suggestions.js";
import publicRoutes from "./routes/public.js";
import pushRoutes from "./routes/push.js";
import { ensureDefaultDestinations } from "./lib/seedDestinations.js";
import { ensureDefaultPriceZones } from "./lib/seedPricing.js";
import { ensureUploadsDir, uploadsDir } from "./lib/uploads.js";
import { dernierApk, APPLICATIONS } from "./lib/apkLatest.js";
import { readdir } from "node:fs/promises";
import { mailStatusLine } from "./lib/mailer.js";
import { webPushStatusLine } from "./lib/webPush.js";
import { registerSocketHandlers } from "./sockets/index.js";
import { generateWeeklyReports } from "./jobs/weeklyReport.js";
import { sendRideReminders } from "./jobs/rideReminders.js";
import { voiceStatusLine } from "./lib/twilioVoice.js";
import { FUSEAU_TAXI } from "./lib/ridesOrder.js";
import {
  fichiersPublics, faireSauvegarde, sauvegardeSiAncienne, sauvegardesStatusLine, etatSauvegardes, envoyerCopieExterne, copieExterneStatusLine,
} from "./lib/sauvegarde.js";
import { alertesStatusLine, signalerErreur } from "./lib/alertes.js";
import { prisma } from "./lib/prisma.js";
import { previousWeekRange } from "./lib/semaines.js";
import { VERSION_SERVEUR } from "./version.js";

const DEMARRE_LE = new Date().toISOString();
const app = express();
app.set("trust proxy", 1); // derrière le proxy Railway — nécessaire pour que req.ip soit la vraie IP (limiteur de tentatives)

// CORS_ORIGIN : "*" (tout), ou une liste séparée par des virgules. Les apps natives n'envoient
// pas d'en-tête Origin et passent toujours ; seules les pages web sont filtrées par le navigateur.
const allowedOrigins = (process.env.CORS_ORIGIN || "*").split(",").map((o) => o.trim()).filter(Boolean);
const corsOrigin =
  allowedOrigins.includes("*")
    ? "*"
    : (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin) || /-taxi-sylvain\.vercel\.app$/.test(origin));
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: "1mb" }));

ensureUploadsDir();
// Les journaux de Railway disent ce qui est actif : courriels, appel vocal, Web Push.
console.log(mailStatusLine());
console.log(voiceStatusLine());
console.log(webPushStatusLine());
console.log(alertesStatusLine());
console.log(sauvegardesStatusLine());
console.log(copieExterneStatusLine());
console.log(`Version du serveur : ${VERSION_SERVEUR}`);
// Photos servies en lecture seule : jamais interprétées comme une page (nosniff) ni exécutées
// (sandbox), même si un fichier piégé avait été déposé avant le verrouillage de l'envoi. Le
// dossier caché des sauvegardes (.sauvegardes/) n'est jamais servi (voir lib/sauvegarde.js).
app.use("/uploads", fichiersPublics(uploadsDir));

// /health : le programme répond (vivant). /health/ready : il peut vraiment servir — la base répond,
// avec la version du code, la dernière migration appliquée et l'âge de la dernière sauvegarde, pour
// la surveillance (audit du 7 octobre 2026, OPS-04 : /health restait vert base en panne). Aucune
// donnée personnelle.
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/health/ready", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const etat = { version: VERSION_SERVEUR, demarreLe: DEMARRE_LE, sauvegardes: etatSauvegardes() };
  try {
    const [ligne] = await Promise.race([
      prisma.$queryRawUnsafe('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name DESC LIMIT 1'),
      new Promise((_, rejeter) => setTimeout(() => rejeter(new Error("délai dépassé")), 3000)),
    ]);
    res.json({ ok: true, base: "ok", migration: ligne?.migration_name || null, ...etat });
  } catch {
    res.status(503).json({ ok: false, base: "panne", ...etat });
  }
});

// Liens de téléchargement Android définitifs, à donner aux chauffeurs et aux clients :
// /telecharger/chauffeur.apk et /telecharger/client.apk renvoient vers le fichier le plus récent
// du dossier apk/ du disque persistant, quelle que soit sa version (règle dans lib/apkLatest.js).
app.get("/telecharger/:application.apk", async (req, res) => {
  const application = String(req.params.application || "").toLowerCase();
  if (!APPLICATIONS.includes(application)) return res.status(404).json({ error: "Application inconnue." });
  let fichiers = [];
  try {
    fichiers = await readdir(path.join(uploadsDir, "apk"));
  } catch {
    fichiers = [];
  }
  const nom = dernierApk(fichiers, application);
  if (!nom) return res.status(404).json({ error: "Aucune version Android disponible pour le moment." });
  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, "/uploads/apk/" + encodeURIComponent(nom));
});
// Pages publiques (suppression de compte, confidentialité, conditions) exigées par Google Play,
// Apple et la Loi 25. Textes réécrits le 19 septembre 2026 pour correspondre au code, puis vérifiés
// phrase par phrase contre le code par des relecteurs indépendants.
app.use(publicRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/rides", rideRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/ratings", ratingRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/schedule", scheduleRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/geocode", geocodeRoutes);
app.use("/api/admins", adminRoutes);
app.use("/api/destinations", destinationRoutes);
app.use("/api/pricing", pricingRoutes);
app.use("/api/suggestions", suggestionRoutes);
// Abonnement des navigateurs aux notifications Web Push (versions web des trois applications).
app.use("/api/push", pushRoutes);
ensureDefaultDestinations().catch((e) => console.error("Destinations par défaut :", e.message));
ensureDefaultPriceZones().catch((e) => console.error("Grille tarifaire par défaut :", e.message));

// Après toutes les routes : une erreur imprévue donne une réponse 500 au lieu d'arrêter le serveur.
installErrorHandler(app);
installProcessGuards();

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: corsOrigin } });
app.set("io", io);
registerSocketHandlers(io);

// Les tâches planifiées suivent l'heure du Québec, jamais celle du serveur (Railway tourne en
// UTC) : sans ce réglage, le récap « du lundi à 00 h 05 » partait le dimanche soir à 20 h 05,
// heure de Montréal, et la semaine comptée ne correspondait pas à la semaine vécue.
const HORLOGE_QUEBEC = { timezone: FUSEAU_TAXI };

// Génère automatiquement le récap de la semaine qui vient de se terminer, chaque lundi à 04 h 00,
// heure de Montréal (demande du propriétaire du 6 octobre 2026 ; 00 h 05 auparavant), puis l'envoie
// par courriel et notification à chaque chauffeur, une seule fois par semaine (jobs/weeklyReport.js).
// POST /api/reports/generate recalcule à la main, sans courriel ni notification.
cron.schedule("0 4 * * 1", () => generateWeeklyReports(io, undefined, { courriel: true }).catch((e) => signalerErreur("Récap hebdomadaire du lundi", e)), HORLOGE_QUEBEC);
// Audit du 7 octobre 2026 (B16) : un récap dont aucun envoi n'a abouti (panne) redevient « à
// envoyer » ; il est retenté chaque heure le lundi et le mardi (sans nouvelle synthèse au Dispatch).
cron.schedule("0 5-23 * * 1,2", () => generateWeeklyReports(io, undefined, { courriel: true, synthese: "jamais" }).catch((e) => signalerErreur("Relance du récap hebdomadaire", e)), HORLOGE_QUEBEC);
// Serveur arrêté le lundi à 04 h 00 : au démarrage, si AUCUN chauffeur n'a été prévenu pour la semaine
// dernière, le récap part maintenant (une seule fois par chauffeur, grâce à notifiedAt).
async function rattraperRecapHebdomadaire() {
  const { weekStart } = previousWeekRange();
  const dejaPrevenus = await prisma.weeklyReport.count({ where: { weekStart, notifiedAt: { not: null } } });
  if (dejaPrevenus > 0) return;
  await generateWeeklyReports(io, undefined, { courriel: true, synthese: "si-nouveaux" });
}
setTimeout(() => rattraperRecapHebdomadaire().catch((e) => signalerErreur("Rattrapage du récap hebdomadaire au démarrage", e)), 120_000).unref();

// Rappels de course programmés (besoin #1) — voir src/jobs/rideReminders.js.
cron.schedule("* * * * *", () => sendRideReminders(io).catch((e) => signalerErreur("Rappels de course", e)), HORLOGE_QUEBEC);

// Sauvegarde de la base chaque nuit à 3 h 30, heure du Québec (14 gardées, lib/sauvegarde.js), et
// une sauvegarde de rattrapage une minute après le démarrage si la dernière date de plus de 20 h.
const journaliserSauvegarde = (r) => r && console.log(`Sauvegarde de la base faite : ${r.fichier} (${Math.round(r.octets / 1024)} Ko).`);
cron.schedule("30 3 * * *", () => faireSauvegarde().then(journaliserSauvegarde).catch((e) => signalerErreur("Sauvegarde de la base", e)), HORLOGE_QUEBEC);
setTimeout(() => sauvegardeSiAncienne().then(journaliserSauvegarde).catch((e) => signalerErreur("Sauvegarde de la base (rattrapage au démarrage)", e)), 60_000).unref();
// Copie chiffrée hors de Railway, chaque dimanche à 05 h 00 (lib/sauvegarde.js, inactive tant que
// SAUVEGARDE_COURRIEL et SAUVEGARDE_CLE ne sont pas posées). Un échec part en alerte.
cron.schedule("0 5 * * 0", () => envoyerCopieExterne()
  .then((r) => r?.envoye && console.log(`Copie externe envoyée : ${r.fichier} (${Math.round(r.octets / 1024)} Ko, chiffrée).`))
  .catch((e) => signalerErreur("Copie externe des sauvegardes", e)), HORLOGE_QUEBEC);

const port = process.env.PORT || 4000;
server.listen(port, () => console.log(`Taxi Sylvain API en écoute sur le port ${port}`));
