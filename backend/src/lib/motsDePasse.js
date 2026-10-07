// Mots de passe fixés par le Dispatch : réinitialisation et fermeture des sessions.
//
// Audit du 7 octobre 2026 (B05) : un compte importé recevait un mot de passe temporaire que personne
// ne voyait, et aucun moyen n'existait d'en donner un nouveau. Le Dispatch peut désormais générer un
// mot de passe temporaire, montré une seule fois. Toutes les sessions déjà ouvertes du compte sont
// alors révoquées (génération de sessions suivante, voir middleware/auth.js) et ses connexions temps
// réel coupées (SEC-07).
import bcrypt from "bcryptjs";
import { prisma } from "./prisma.js";
import { generateTempPassword, realEmailOrNull } from "./placeholderEmail.js";
import { salleCompte } from "./equipe.js";

/** Coupe toutes les connexions temps réel d'un compte (elles se reconnecteront avec un jeton valide). */
export function fermerConnexions(io, userId) {
  io?.in(salleCompte(userId)).disconnectSockets(true);
}

/**
 * Nouveau mot de passe temporaire pour un compte du rôle attendu (CLIENT ou DRIVER), ou null si le
 * compte n'existe pas ou n'a pas ce rôle (une route Clients ne doit jamais toucher un chauffeur).
 */
export async function reinitialiserMotDePasse(userId, role, io, { db = prisma } = {}) {
  const compte = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, name: true, email: true } });
  if (!compte || compte.role !== role) return null;
  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  await db.user.update({ where: { id: userId }, data: { passwordHash, sessionVersion: { increment: 1 } } });
  fermerConnexions(io, userId);
  return { id: compte.id, name: compte.name, email: realEmailOrNull(compte.email), tempPassword };
}
