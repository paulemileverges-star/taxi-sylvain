// Droits de l'équipe Taxi Sylvain : le Dispatch (propriétaire, tous les droits) et les comptes ADMIN
// (collaborateurs, droits choisis par le Dispatch parmi six permissions).
//
// Audit du 7 octobre 2026 (SEC-02, SEC-03) : plusieurs lectures acceptaient tout compte ADMIN sans
// regarder ses permissions, et le temps réel envoyait tout à la salle « dispatch », où entrait chaque
// ADMIN. Un collaborateur sans aucun droit voyait donc les courses, les positions des chauffeurs, les
// messages directs et même les groupes dont il n'était pas membre. Désormais :
//   - une seule règle, aPermission(), pour les routes HTTP comme pour le temps réel ;
//   - une salle par permission (« equipe:courses »...), rejointe selon les droits du compte ;
//   - la salle « dispatch » est réservée au propriétaire (demandes de suppression de compte) ;
//   - les messages personnels (groupes) passent par la salle du compte, « user:<id> ».
export const PERMISSIONS_EQUIPE = ["courses", "schedule", "drivers", "clients", "reports", "groups"];

// Salle du propriétaire seul. Gardée sous ce nom pour les évènements qui ne concernent que lui.
export const SALLE_PROPRIETAIRE = "dispatch";

export const sallePermission = (permission) => `equipe:${permission}`;
export const salleCompte = (userId) => `user:${userId}`;

export function estEquipe(user) {
  return user?.role === "DISPATCH" || user?.role === "ADMIN";
}

/** Le compte a-t-il AU MOINS UNE de ces permissions ? Le Dispatch les a toutes. */
export function aPermission(user, ...permissions) {
  if (!user) return false;
  if (user.role === "DISPATCH") return true;
  if (user.role !== "ADMIN") return false;
  const siennes = Array.isArray(user.permissions) ? user.permissions : [];
  return permissions.some((p) => siennes.includes(p));
}

/** Salles d'équipe qu'un compte doit rejoindre (aucune pour un chauffeur ou un client). */
export function sallesEquipe(user) {
  if (user?.role === "DISPATCH") return [SALLE_PROPRIETAIRE, ...PERMISSIONS_EQUIPE.map(sallePermission)];
  if (user?.role === "ADMIN") {
    const siennes = Array.isArray(user.permissions) ? user.permissions : [];
    return PERMISSIONS_EQUIPE.filter((p) => siennes.includes(p)).map(sallePermission);
  }
  return [];
}

// Qui reçoit quoi. Une course intéresse la page Courses et la Cédule ; une position GPS, la carte en
// direct (Courses) et la page Chauffeurs ; un message direct, la Messagerie.
export const AUDIENCES = {
  courses: ["courses", "schedule"],
  positions: ["courses", "drivers"],
  chauffeurs: ["drivers"],
  messagesDirects: ["groups"],
  rapports: ["reports"],
};

/**
 * Émet un évènement aux membres de l'équipe qui ont l'une de ces permissions (une seule fois par
 * connexion, même si elle est dans plusieurs salles). `sauf` exclut des salles (ex. éviter d'envoyer
 * une version réduite à ceux qui reçoivent déjà la version complète).
 */
export function emettreEquipe(io, permissions, evenement, charge, { sauf = [] } = {}) {
  if (!io) return;
  const salles = permissions.map(sallePermission);
  let cible = io.to(salles);
  if (sauf.length) cible = cible.except(sauf.map(sallePermission));
  cible.emit(evenement, charge);
}

/**
 * Le Dispatch vient de changer les permissions d'un collaborateur : ses connexions temps réel déjà
 * ouvertes quittent les salles qu'il n'a plus le droit d'écouter et rejoignent les nouvelles, sans
 * attendre une reconnexion. Il quitte aussi les suivis de course s'il n'a plus accès aux courses.
 */
export async function actualiserSallesEquipe(io, user) {
  if (!io || !user?.id) return;
  const sockets = await io.in(salleCompte(user.id)).fetchSockets();
  const voulues = new Set(sallesEquipe(user));
  for (const socket of sockets) {
    if (socket.user) socket.user = { ...socket.user, role: user.role, permissions: user.permissions || [] };
    for (const salle of [...socket.rooms]) {
      const salleEquipe = salle === SALLE_PROPRIETAIRE || salle.startsWith("equipe:");
      const suivi = salle.startsWith("ride:") && !aPermission(user, ...AUDIENCES.courses);
      if ((salleEquipe && !voulues.has(salle)) || suivi) socket.leave(salle);
    }
    for (const salle of voulues) socket.join(salle);
  }
}
