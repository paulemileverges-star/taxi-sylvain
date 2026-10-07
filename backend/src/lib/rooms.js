// Room Socket.io personnelle d'un utilisateur — utilisé pour lui pousser des évènements (messages
// de groupe, messages de course...) peu importe l'écran qu'il regarde.
//
// Audit du 7 octobre 2026 (SEC-03) : cette fonction renvoyait « dispatch » pour tout compte de
// l'équipe. Un groupe privé dont un seul ADMIN était membre était donc diffusé à TOUTE l'équipe
// connectée, membres ou non. Chaque compte a désormais sa propre salle, « user:<id> », que toutes ses
// connexions rejoignent (sockets/index.js), quel que soit son rôle.
export function personalRoom(user) {
  return user?.id ? `user:${user.id}` : null;
}
