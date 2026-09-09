import "dotenv/config";
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
import { registerSocketHandlers } from "./sockets/index.js";
import { generateWeeklyReports } from "./jobs/weeklyReport.js";

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.get("/health", (req, res) => res.json({ ok: true }));
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

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CORS_ORIGIN || "*" } });
app.set("io", io);
registerSocketHandlers(io);

// Génère automatiquement le récap de la semaine qui vient de se terminer, chaque lundi à 00h05
// (besoin #14) — voir POST /api/reports/generate pour un déclenchement manuel (tests, rattrapage).
cron.schedule("5 0 * * 1", () => generateWeeklyReports(io));

const port = process.env.PORT || 4000;
server.listen(port, () => console.log(`Taxi Sylvain API en écoute sur le port ${port}`));
