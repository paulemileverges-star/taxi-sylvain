import crypto from "node:crypto";

// Domaine utilisé pour générer un courriel technique quand un client est créé sans en fournir un
// (compte "sur fiche", réservation téléphonique). Ce courriel n'est jamais réel — il ne doit
// jamais être affiché au Dispatch ni apparaître dans un export comme s'il s'agissait d'une vraie
// coordonnée du client. Il est refusé à l'inscription publique (audit du 7 octobre 2026, SEC-11).
export const PLACEHOLDER_EMAIL_DOMAIN = "@reservation.taxisylvain.local";

// Casse et espaces ignorés : « X@Reservation.TaxiSylvain.local » est le même domaine réservé.
export function isPlaceholderEmail(email) {
  return typeof email === "string" && email.trim().toLowerCase().endsWith(PLACEHOLDER_EMAIL_DOMAIN);
}

// Retourne le courriel tel quel s'il est réel, ou null s'il s'agit d'un courriel technique généré.
export function realEmailOrNull(email) {
  return isPlaceholderEmail(email) ? null : email;
}

// Génère un mot de passe temporaire lisible (facile à copier/transmettre), distinct des jetons
// aléatoires hexadécimaux utilisés en interne pour les comptes créés sans intention de connexion.
// Tirage cryptographique (crypto.randomInt), jamais Math.random (audit du 7 octobre 2026, SEC-12).
export const ALPHABET_MOT_DE_PASSE = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
export function generateTempPassword(longueur = 12, tirage = crypto.randomInt) {
  let out = "";
  for (let i = 0; i < longueur; i++) out += ALPHABET_MOT_DE_PASSE[tirage(0, ALPHABET_MOT_DE_PASSE.length)];
  return out;
}
