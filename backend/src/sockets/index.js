import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { makeAssignmentCheck } from "../lib/rideTracking.js";
import { markDriverOnline, markDriverOffline } from "../lib/onlineDrivers.js";
import { setDriverLocation, getAllDriverLocations } from "../lib/driverLocations.js";
import { sessionEnCours } from "../middleware/auth.js";
import { AUDIENCES, aPermission, emettreEquipe, estEquipe, salleCompte, sallesEquipe } from "../lib/equipe.js";

// Le chauffeur qui envoie sa position est-il toujours celui de la course ? (voir lib/rideTracking.js)
const isCurrentDriver = makeAssignmentCheck((rideId) =>
  prisma.ride.findUnique({ where: { id: rideId }, select: { driverId: true, status: true } })
);

// Une position GPS par seconde au plus et par connexion : au-delà, les envois sont ignorés
// (audit du 7 octobre 2026, SEC-14). L'application chauffeur en envoie une toutes les 5 secondes.
export const INTERVALLE_POSITION_MS = 1000;

/** Coordonnées utilisables : nombres finis, dans les bornes de la Terre. */
export function positionValide(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

// Chaque utilisateur rejoint des "rooms" selon son rôle, pour recevoir uniquement
// les événements qui le concernent :
// - tout compte : "user:{id}" (personnel : messages de groupe, décisions, déconnexion forcée)
// - DISPATCH : "dispatch" (propriétaire) et toutes les salles d'équipe ; ADMIN : les salles
//   d'équipe de ses permissions seulement ("equipe:courses"...), voir lib/equipe.js
// - DRIVER rejoint "drivers" (diffusion générale) + "driver:{id}" (personnel)
// - CLIENT rejoint "client:{id}" (personnel)
// - "ride:{id}" (suivi d'une course) : réservé au client et au chauffeur de la course et à l'équipe
//   autorisée aux courses
export function registerSocketHandlers(io) {
  // Même règle que requireAuth : le compte doit encore exister, le jeton être de la génération de
  // sessions en cours, et le rôle comme les permissions viennent de la base.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (payload?.portee) return next(new Error("unauthorized"));
      const user = await prisma.user.findUnique({
        where: { id: payload.id },
        select: { id: true, role: true, name: true, permissions: true, sessionVersion: true },
      });
      if (!user || !sessionEnCours(payload, user)) return next(new Error("unauthorized"));
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
    socket.join(salleCompte(id));
    if (estEquipe(socket.user)) {
      for (const salle of sallesEquipe(socket.user)) socket.join(salle);
      // Positions déjà connues, pour que la carte soit peuplée dès l'ouverture.
      if (aPermission(socket.user, ...AUDIENCES.positions)) socket.emit("driver:locations", getAllDriverLocations());
    }
    if (role === "DRIVER") {
      socket.join("drivers");
      socket.join(`driver:${id}`);
    }
    if (role === "CLIENT") socket.join(`client:${id}`);

    // Statut en ligne/hors ligne des chauffeurs, affiché à l'équipe (point vert/rouge).
    if (role === "DRIVER") {
      if (markDriverOnline(id)) emettreEquipe(io, AUDIENCES.positions, "driver:online", { driverId: id });
      socket.on("disconnect", () => {
        if (markDriverOffline(id)) emettreEquipe(io, AUDIENCES.positions, "driver:offline", { driverId: id });
      });
    }

    // Suivi d'une course (position GPS, messages, étapes) : réservé à son client, à son chauffeur
    // et à l'équipe autorisée aux courses. Avant le 19 septembre 2026, n'importe quel compte
    // connecté pouvait s'abonner à n'importe quelle course ; avant le 7 octobre, tout ADMIN.
    socket.on("ride:watch", async (rideId) => {
      try {
        if (typeof rideId !== "string" || !rideId || rideId.length > 64) return;
        // socket.user est tenu à jour quand le Dispatch change les permissions (lib/equipe.js).
        if (estEquipe(socket.user)) {
          if (aPermission(socket.user, ...AUDIENCES.courses)) socket.join(`ride:${rideId}`);
          return;
        }
        const ride = await prisma.ride.findUnique({ where: { id: rideId }, select: { clientId: true, driverId: true } });
        if (ride && (ride.clientId === id || ride.driverId === id)) socket.join(`ride:${rideId}`);
      } catch (e) {
        console.error("Abonnement au suivi de course impossible :", e.message);
      }
    });
    socket.on("ride:unwatch", (rideId) => {
      if (typeof rideId === "string") socket.leave(`ride:${rideId}`);
    });

    // Position GPS d'un chauffeur en route (besoin: suivi en direct sur carte pour le Dispatch,
    // et pour le client pendant sa propre course — voir besoin #13). Relais uniquement, pas de
    // persistance : la position n'a de sens qu'en direct pendant une course active.
    let dernierePosition = 0;
    socket.on("driver:location", async (data) => {
      const { rideId, status, lat, lng } = data || {};
      if (role !== "DRIVER" || !positionValide(lat, lng)) return;
      const maintenant = Date.now();
      if (maintenant - dernierePosition < INTERVALLE_POSITION_MS) return;
      dernierePosition = maintenant;
      try {
        // La course n'est rattachée à la position que si ce chauffeur en est toujours le chauffeur.
        const courant = typeof rideId === "string" && rideId ? await isCurrentDriver(rideId, id) : false;
        const payload = {
          driverId: id, name: socket.user.name, rideId: courant ? rideId : null,
          status: typeof status === "string" ? status.slice(0, 20) : null, lat, lng, at: maintenant,
        };
        setDriverLocation(id, payload);
        emettreEquipe(io, AUDIENCES.positions, "driver:location", payload);
        // Vers le client de la course : seulement si ce chauffeur est toujours celui de la course.
        if (courant) io.to(`ride:${rideId}`).emit("driver:location", payload);
      } catch (e) {
        console.error("Relais de position impossible :", e.message);
      }
    });
  });
}
