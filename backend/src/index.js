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
import { mailStatusLine } from "./lib/mailer.js";
import { webPushStatusLine } from "./lib/webPush.js";
import { registerSocketHandlers } from "./sockets/index.js";
import { generateWeeklyReports } from "./jobs/weeklyReport.js";
import { sendRideReminders } from "./jobs/rideReminders.js";
import { voiceStatusLine } from "./lib/twilioVoice.js";
import { FUSEAU_TAXI } from "./lib/ridesOrder.js";

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
// Photos servies en lecture seule : jamais interprétées comme une page (nosniff) ni exécutées
// (sandbox), même si un fichier piégé avait été déposé avant le verrouillage de l'envoi.
app.use(
  "/uploads",
  express.static(uploadsDir, {
    fallthrough: true,
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; sandbox");
    },
  })
);

app.get("/health", (req, res) => res.json({ ok: true }));
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

// Génère automatiquement le récap de la semaine qui vient de se terminer, chaque lundi à 00h05
// (besoin #14), et l'envoie par courriel à chaque chauffeur. POST /api/reports/generate permet un
// déclenchement manuel (tests, rattrapage) qui, lui, n'envoie pas de courriel.
cron.schedule("5 0 * * 1", () => generateWeeklyReports(io, undefined, { courriel: true }).catch((e) => console.error("Erreur récap hebdomadaire:", e.message)), HORLOGE_QUEBEC);

// Rappels de course programmés (besoin #1) — voir src/jobs/rideReminders.js.
cron.schedule("* * * * *", () => sendRideReminders(io).catch((e) => console.error("Erreur rappels de course:", e.message)), HORLOGE_QUEBEC);

const port = process.env.PORT || 4000;
server.listen(port, () => console.log(`Taxi Sylvain API en écoute sur le port ${port}`));
