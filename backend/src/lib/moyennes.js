// Moyenne des notes reçues par un compte, recalculée par la base elle-même en une seule écriture
// (audit du 7 octobre 2026, CONC-02 et B17).
//
// Avant : lecture de la moyenne puis écriture séparée, sujette aux écritures simultanées, et 5/5 par
// défaut sans aucune note. Désormais la moyenne vient de la base au moment de l'écriture (la dernière
// écriture voit toujours toutes les notes déjà enregistrées) et reste vide sans note réelle.
import { prisma } from "./prisma.js";

export async function recalculerMoyenne(userId, db = prisma) {
  if (!userId) return;
  await db.$executeRaw`UPDATE "User" SET "ratingAvg" = (SELECT AVG("stars")::double precision FROM "Rating" WHERE "toUserId" = ${userId}) WHERE "id" = ${userId}`;
}

/** Recalcule la moyenne de plusieurs comptes (après la suppression d'un compte et de ses notes). */
export async function recalculerMoyennes(userIds, db = prisma) {
  for (const id of new Set((userIds || []).filter(Boolean))) await recalculerMoyenne(id, db);
}
