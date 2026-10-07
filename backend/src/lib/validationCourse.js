// Règles de validation d'une course, communes à la création et à la modification (audit du
// 7 octobre 2026, SEC-05, SEC-06 et B13). Fonctions pures, testées sans base de données.

// Champs qu'un CLIENT peut envoyer quand il réserve dans son application. Tout le reste (chauffeur,
// diffusion, montant, distance, client, nouveau chauffeur...) est ignoré : seul Taxi Sylvain affecte,
// diffuse et fixe les prix. Avant le 7 octobre, un client pouvait s'affecter un chauffeur, diffuser
// sa demande à tous, ou imposer un montant (même négatif) avec un code de destination inconnu.
export const CHAMPS_RESERVATION_CLIENT = [
  "pickupAddress", "pickupLat", "pickupLng", "pickupConfidence", "pickupPlaceId",
  "destAddress", "destLat", "destLng", "destConfidence", "destPlaceId",
  "destinationCode", "scheduledFor", "flightNumber", "stops",
];

export function champsReservationClient(corps) {
  const out = {};
  for (const champ of CHAMPS_RESERVATION_CLIENT) if (corps?.[champ] !== undefined) out[champ] = corps[champ];
  return out;
}

export const LONGUEUR_MAX_ADRESSE = 300;
export const LONGUEUR_MAX_VOL = 20;

/** Coordonnée utilisable (nombre fini dans les bornes), sinon null. */
export function coordonnee(valeur, borne) {
  return typeof valeur === "number" && Number.isFinite(valeur) && Math.abs(valeur) <= borne ? valeur : null;
}
export const latitude = (v) => coordonnee(v, 90);
export const longitude = (v) => coordonnee(v, 180);

/**
 * Heure de prise en charge : absente (course immédiate), ou une date valide. Renvoie
 * { date } (Date ou null) ou { erreur }.
 */
export function heureDePriseEnCharge(valeur) {
  if (valeur === undefined || valeur === null || valeur === "") return { date: null };
  const date = new Date(valeur);
  if (typeof valeur === "boolean" || Number.isNaN(date.getTime())) return { erreur: "Date invalide." };
  return { date };
}

/** Montant : nombre fini positif ou nul, arrondi au cent. null si invalide. */
export function montantCourse(valeur) {
  if (valeur === null || valeur === "" || typeof valeur === "boolean" || Array.isArray(valeur)) return null;
  const n = Number(valeur);
  if (!Number.isFinite(n) || n < 0 || n > 100000) return null;
  return Math.round(n * 100) / 100;
}

/** Distance saisie : nombre fini positif ou nul (km), null si invalide. */
export function distanceSaisie(valeur) {
  if (valeur === null || valeur === "" || typeof valeur === "boolean") return null;
  const n = Number(valeur);
  return Number.isFinite(n) && n >= 0 && n <= 5000 ? n : null;
}

/** Texte d'adresse : chaîne non vide de longueur raisonnable. */
export function adresseValide(valeur) {
  return typeof valeur === "string" && valeur.trim().length > 0 && valeur.length <= LONGUEUR_MAX_ADRESSE;
}

/** Numéro de vol nettoyé, ou null. */
export function numeroDeVol(valeur) {
  return typeof valeur === "string" && valeur.trim() ? valeur.trim().slice(0, LONGUEUR_MAX_VOL) : null;
}
