import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { makeAssignmentCheck } from "../lib/rideTracking.js";
import { markDriverOnline, markDriverOffline } from "../lib/onlineDrivers.js";
import { setDriverLocation, getAllDriverLocations } from "../lib/driverLocations.js";

// Le chauffeur qui envoie sa position est-il toujours celui de la course ? (voir lib/rideTracking.js)
const isCurrentDriver = makeAssignmentCheck((rideId) =>
  prisma.ride.findUnique({ where: { id: rideId }, select: { driverId: true, status: true } })
);

// Chaque utilisateur rejoint des "rooms" selon son rôle, pour recevoir uniquement
// les événements qui le concernent :
// - DISPATCH et ADMIN rejoignent "dispatch"
// - DRIVER rejoint "drivers" (diffusion générale) + "driver:{id}" (personnel)
// - CLIENT rejoint "client:{id}" (personnel — messages directs, groupes de discussion)
// - "ride:{id}" (suivi d'une course) : réservé au client et au chauffeur de la course et à l'équipe
export function registerSocketHandlers(io) {
  // Même règle que requireAuth : le compte doit encore exister, et son rôle vient de la base.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { id: payload.id },
        select: { id: true, role: true, name: true, permissions: true },
      });
      if (!user) return next(new Error("unauthorized"));
      socket.user = { id: user.id, role: user.role, name: user.name, permissions: user.permissions || [] };
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const { role, id } = socket.user;
    // Salle propre à chaque compte, quel que soit son rôle : permet de retirer toutes ses
    // connexions d'un suivi de course, ou de les couper quand le compte est supprimé.
    socket.join(`user:${id}`);
    // Les admins (collaborateurs) reçoivent les mêmes évènements temps réel que le Dispatch.
    if (role === "DISPATCH" || role === "ADMIN") {
      socket.join("dispatch");
      // Positions déjà connues, pour que la carte soit peuplée dès l'ouverture.
      socket.emit("driver:locations", getAllDriverLocations());
    }
    if (role === "DRIVER") {
      socket.join("drivers");
      socket.join(`driver:${id}`);
    }
    if (role === "CLIENT") socket.join(`client:${id}`);

    // Statut en ligne/hors ligne des chauffeurs, affiché au Dispatch (point vert/rouge).
    if (role === "DRIVER") {
      if (markDriverOnline(id)) io.to("dispatch").emit("driver:online", { driverId: id });
      socket.on("disconnect", () => {
        if (markDriverOffline(id)) io.to("dispatch").emit("driver:offline", { driverId: id });
      });
    }

    // Suivi d'une course (position GPS, messages, étapes) : réservé à son client, à son chauffeur
    // et à l'équipe Taxi Sylvain. Avant le 19 septembre 2026, n'importe quel compte connecté
    // pouvait s'abonner à n'importe quelle course.
    socket.on("ride:watch", async (rideId) => {
      try {
        if (typeof rideId !== "string" || !rideId) return;
        if (role === "DISPATCH" || role === "ADMIN") return socket.join(`ride:${rideId}`);
        const ride = await prisma.ride.findUnique({ where: { id: rideId }, select: { clientId: true, driverId: true } });
        if (ride && (ride.clientId === id || ride.driverId === id)) socket.join(`ride:${rideId}`);
      } catch (e) {
        console.error("Abonnement au suivi de course impossible :", e.message);
      }
    });
    socket.on("ride:unwatch", (rideId) => socket.leave(`ride:${rideId}`));

    // Position GPS d'un chauffeur en route (besoin: suivi en direct sur carte pour le Dispatch,
    // et pour le client pendant sa propre course — voir besoin #13). Relais uniquement, pas de
    // persistance : la position n'a de sens qu'en direct pendant une course active.
    socket.on("driver:location", async (data) => {
      const { rideId, status, lat, lng } = data || {};
      if (role !== "DRIVER" || typeof lat !== "number" || typeof lng !== "number") return;
      const payload = { driverId: id, name: socket.user.name, rideId: rideId || null, status, lat, lng, at: Date.now() };
      setDriverLocation(id, payload);
      io.to("dispatch").emit("driver:location", payload);
      // Vers le client de la course : seulement si ce chauffeur est toujours celui de la course.
      try {
        if (rideId && (await isCurrentDriver(rideId, id))) io.to(`ride:${rideId}`).emit("driver:location", payload);
      } catch (e) {
        console.error("Relais de position impossible :", e.message);
      }
    });
  });
}
