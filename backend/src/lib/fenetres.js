// Délais avant une course planifiée, pour le chauffeur (demandes du propriétaire du 6 octobre 2026).
//
// - Contacter le client (message dans l'application ou appel masqué) : à partir de 2 heures avant
//   l'heure de prise en charge. Avant, il passe par Taxi Sylvain. (Avant le 6 octobre : 1 heure,
//   et l'appel masqué n'avait aucun délai.)
// - Se mettre en route ou démarrer la course : à partir de 3 heures avant, exactement. Avant, le
//   serveur refuse : plus de départ par erreur ou par anticipation.
//
// Le client, lui, peut écrire et appeler quand il veut. Le Dispatch n'est jamais limité.
// Fichier pur : aucune base, aucun réseau, entièrement testable.
import { FUSEAU_TAXI } from "./ridesOrder.js";

export const DELAI_CONTACT_MS = 2 * 60 * 60 * 1000;
export const DELAI_DEPART_MS = 3 * 60 * 60 * 1000;
const EN_COURS = ["EN_ROUTE", "STARTED", "COMPLETED"];

/** Instant à partir duquel l'action est permise, ou null si elle l'est sans condition d'heure. */
function ouverture(ride, delai) {
  if (!ride?.scheduledFor) return null; // course immédiate : pas d'heure programmée
  const t = new Date(ride.scheduledFor).getTime();
  return Number.isNaN(t) ? null : new Date(t - delai);
}

/** Le chauffeur peut-il écrire au client ou l'appeler (numéro masqué) maintenant ? */
export function chauffeurPeutContacter(ride, now = new Date()) {
  if (EN_COURS.includes(ride?.status)) return true;
  const debut = ouverture(ride, DELAI_CONTACT_MS);
  return !debut || now.getTime() >= debut.getTime();
}

/** Le chauffeur peut-il passer la course à « en route » ou « démarrée » maintenant ? */
export function chauffeurPeutPartir(ride, now = new Date()) {
  const debut = ouverture(ride, DELAI_DEPART_MS);
  return !debut || now.getTime() >= debut.getTime();
}

export function ouvertureContact(ride) {
  return ouverture(ride, DELAI_CONTACT_MS);
}
export function ouvertureDepart(ride) {
  return ouverture(ride, DELAI_DEPART_MS);
}

const PARTIES = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSEAU_TAXI, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});

/** « 13:21 » si c'est aujourd'hui (heure du Québec), sinon « 2026-10-07 à 13:21 ». Toujours sur 24 heures. */
export function quandLisible(date, now = new Date()) {
  const p = (d) => Object.fromEntries(PARTIES.formatToParts(d).map((x) => [x.type, x.value]));
  const a = p(new Date(date));
  const b = p(now);
  const heure = `${String(Number(a.hour) % 24).padStart(2, "0")}:${a.minute}`;
  const jour = `${a.year}-${a.month}-${a.day}`;
  return jour === `${b.year}-${b.month}-${b.day}` ? heure : `${jour} à ${heure}`;
}
