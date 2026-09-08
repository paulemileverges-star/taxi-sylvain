// Room Socket.io personnelle d'un utilisateur, selon son rôle — utilisé pour lui pousser des
// évènements (messages de groupe, etc.) peu importe l'écran qu'il regarde.
export function personalRoom(user) {
  if (user.role === "DISPATCH") return "dispatch";
  if (user.role === "DRIVER") return `driver:${user.id}`;
  if (user.role === "CLIENT") return `client:${user.id}`;
  return null;
}
