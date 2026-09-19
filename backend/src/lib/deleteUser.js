import fs from "fs/promises";
import path from "path";
import { prisma } from "./prisma.js";
import { uploadsDir } from "./uploads.js";
import { RIDE_STATUSES_BLOQUANTS, messageCourseEnCours } from "./accountDeletion.js";
import { clearDriverLocation } from "./driverLocations.js";

// Courses pas encore terminées, et courses déjà confiées à un chauffeur.
const NON_TERMINEES = ["REQUESTED", "BROADCAST", "ACCEPTED", "EN_ROUTE", "STARTED"];
const AFFECTEES = ["ACCEPTED", "EN_ROUTE", "STARTED"];

function erreur(code, message, status) {
  const e = new Error(message);
  e.code = code;
  e.status = status;
  return e;
}

// Efface les photos d'un compte : photo du chauffeur, photo du véhicule et leurs anciennes
// versions. Les fichiers sont nommés « <id du compte>-<photo|carPhoto>-<date>.<ext> » et servis
// publiquement : un compte supprimé ne doit plus avoir de photo en ligne. Jamais bloquant.
export async function removeUserUploads(userId, dir = uploadsDir) {
  if (typeof userId !== "string" || !/^[a-z0-9]+$/i.test(userId)) return 0;
  let names;
  try {
    names = await fs.readdir(dir);
  } catch {
    return 0;
  }
  let count = 0;
  for (const name of names) {
    if (!name.startsWith(`${userId}-`)) continue;
    try {
      await fs.unlink(path.join(dir, name));
      count += 1;
    } catch (e) {
      if (e.code !== "ENOENT") console.error(`Photo non effacée (${name}) :`, e.message);
    }
  }
  return count;
}

/**
 * Supprime un compte et tout ce qui lui appartient en propre (messages envoyés, notations, cédule,
 * groupes créés, photos...). Tout se fait dans une seule transaction : si une étape échoue, rien
 * n'est effacé.
 *
 * - Les courses non terminées dont il est le CLIENT sont annulées : il n'y a plus personne à
 *   transporter, elles ne doivent plus être proposées aux chauffeurs.
 * - Les courses confiées à ce CHAUFFEUR et pas encore terminées repartent en attente d'affectation.
 * - Les courses sont ensuite conservées sans lien avec le compte (historique de Taxi Sylvain).
 * - Le compte Dispatch ne peut jamais être supprimé, quelle que soit la route utilisée.
 *
 * refuseIfActive : pour la suppression demandée par la personne elle-même, la présence d'une
 * course en cours est revérifiée À L'INTÉRIEUR de la transaction (une affectation faite entre-temps
 * par le Dispatch est donc prise en compte).
 */
export async function deleteUserCascade(userId, { db = prisma, removeFiles = removeUserUploads, refuseIfActive = false } = {}) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user) throw erreur("COMPTE_INTROUVABLE", "Compte introuvable.", 404);
  if (user.role === "DISPATCH") {
    throw erreur("COMPTE_PROTEGE", "Le compte Dispatch ne peut pas être supprimé : c'est le compte principal de Taxi Sylvain.", 403);
  }

  const result = await db.$transaction(async (tx) => {
    if (refuseIfActive) {
      const enCours = await tx.ride.findFirst({
        where: { OR: [{ clientId: userId }, { driverId: userId }], status: { in: RIDE_STATUSES_BLOQUANTS } },
        select: { id: true },
      });
      if (enCours) throw erreur("COURSE_EN_COURS", messageCourseEnCours(), 409);
    }

    const annulees = await tx.ride.findMany({
      where: { clientId: userId, status: { in: NON_TERMINEES } },
      select: { id: true, driverId: true },
    });
    if (annulees.length > 0) {
      await tx.ride.updateMany({
        where: { id: { in: annulees.map((r) => r.id) } },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
    }

    const aReaffecter = await tx.ride.findMany({
      where: { driverId: userId, status: { in: AFFECTEES } },
      select: { id: true },
    });
    if (aReaffecter.length > 0) {
      await tx.ride.updateMany({
        where: { id: { in: aReaffecter.map((r) => r.id) } },
        data: { status: "REQUESTED", driverId: null },
      });
    }

    const ownedConversations = await tx.conversation.findMany({ where: { createdById: userId }, select: { id: true } });
    const ownedIds = ownedConversations.map((c) => c.id);
    if (ownedIds.length > 0) {
      await tx.groupMessage.deleteMany({ where: { conversationId: { in: ownedIds } } });
      await tx.conversationParticipant.deleteMany({ where: { conversationId: { in: ownedIds } } });
      await tx.conversation.deleteMany({ where: { id: { in: ownedIds } } });
    }

    await tx.groupMessage.deleteMany({ where: { senderId: userId } });
    await tx.conversationParticipant.deleteMany({ where: { userId } });
    await tx.message.deleteMany({ where: { senderId: userId } });
    await tx.message.deleteMany({ where: { driverId: userId } }); // fil direct dispatch<->chauffeur
    await tx.rating.deleteMany({ where: { OR: [{ fromUserId: userId }, { toUserId: userId }] } });
    await tx.schedule.deleteMany({ where: { driverId: userId } });
    await tx.weeklyReport.deleteMany({ where: { driverId: userId } });

    await tx.ride.updateMany({ where: { clientId: userId }, data: { clientId: null } });
    await tx.ride.updateMany({ where: { driverId: userId }, data: { driverId: null } });

    await tx.user.delete({ where: { id: userId } });
    return { userId, role: user.role, annulees, aReaffecter };
  });

  // Après la transaction seulement : un fichier effacé ne peut pas être « annulé » avec elle.
  await removeFiles(userId);
  return result;
}

// Prévient la console Dispatch et les chauffeurs des courses touchées par une suppression, pour
// qu'aucune liste n'affiche une course annulée ou sans chauffeur. Jamais bloquant.
export function announceDeletion(io, result, nom) {
  if (!io || !result) return;
  try {
    // Le compte n'existe plus : ses connexions en temps réel encore ouvertes sont coupées.
    if (result.userId) io.in(`user:${result.userId}`).disconnectSockets(true);
    if (result.role === "DRIVER" && result.userId && clearDriverLocation(result.userId)) {
      io.to("dispatch").emit("driver:location:clear", { driverId: result.userId });
    }
    for (const ride of result.annulees) {
      io.to("drivers").emit("ride:taken", { id: ride.id });
      if (ride.driverId) {
        io.to(`driver:${ride.driverId}`).emit("ride:taken", { id: ride.id });
        io.in(`user:${ride.driverId}`).socketsLeave(`ride:${ride.id}`);
        // Course annulée alors que son chauffeur était en route : il disparaît de la carte.
        if (clearDriverLocation(ride.driverId)) io.to("dispatch").emit("driver:location:clear", { driverId: ride.driverId });
      }
      io.to(`ride:${ride.id}`).emit("ride:status", { id: ride.id, status: "CANCELLED" });
      io.to("dispatch").emit("ride:updated", { id: ride.id, status: "CANCELLED" });
    }
    for (const ride of result.aReaffecter) {
      io.to("dispatch").emit("ride:updated", { id: ride.id, status: "REQUESTED", driverId: null });
    }
    const total = result.annulees.length + result.aReaffecter.length;
    if (total > 0) {
      const roleTexte = result.role === "DRIVER" ? "chauffeur" : "client";
      const detail = [];
      if (result.annulees.length) detail.push(`${result.annulees.length} course(s) annulée(s)`);
      if (result.aReaffecter.length) detail.push(`${result.aReaffecter.length} course(s) à réaffecter`);
      io.to("dispatch").emit("ride:notification", {
        status: "CANCELLED",
        text: `Le compte ${roleTexte} de ${nom} a été supprimé : ${detail.join(", ")}.`,
      });
    }
  } catch (e) {
    console.error("Avertissement après suppression de compte impossible :", e.message);
  }
}
