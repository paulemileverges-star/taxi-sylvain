// Domaine utilisé pour générer un courriel technique quand un client est créé sans en fournir un
// (compte "sur fiche", réservation téléphonique). Ce courriel n'est jamais réel — il ne doit
// jamais être affiché au Dispatch ni apparaître dans un export comme s'il s'agissait d'une vraie
// coordonnée du client.
export const PLACEHOLDER_EMAIL_DOMAIN = "@reservation.taxisylvain.local";

export function isPlaceholderEmail(email) {
  return typeof email === "string" && email.endsWith(PLACEHOLDER_EMAIL_DOMAIN);
}

// Retourne le courriel tel quel s'il est réel, ou null s'il s'agit d'un courriel technique généré.
export function realEmailOrNull(email) {
  return isPlaceholderEmail(email) ? null : email;
}

// Génère un mot de passe temporaire lisible (facile à copier/transmettre), distinct des jetons
// aléatoires hexadécimaux utilisés en interne pour les comptes créés sans intention de connexion.
export function generateTempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
