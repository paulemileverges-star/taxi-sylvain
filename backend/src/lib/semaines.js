// Semaines de Taxi Sylvain : du lundi 00 h 00 au dimanche 23 h 59 min 59 s, HEURE DU QUÉBEC.
//
// Avant le 20 septembre 2026, les bornes étaient calculées à l'heure du serveur (UTC sur Railway) :
// une course terminée le dimanche à 22 h à Montréal (lundi 02 h UTC) tombait dans la semaine
// suivante. Fichier pur (sans base ni réseau), sorti de jobs/weeklyReport.js le 6 octobre 2026 pour
// servir aussi aux rapports du Dispatch et aux exports.
import { FUSEAU_TAXI } from "./ridesOrder.js";

const PARTIES = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSEAU_TAXI, hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

export function partiesQuebec(date) {
  const p = Object.fromEntries(PARTIES.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, mi: Number(p.minute), s: Number(p.second) };
}

/** Écart, en minutes, entre l'heure du Québec et UTC à cet instant (négatif : Québec en retard). */
function decalageMinutes(date) {
  const { y, m, d, h, mi, s } = partiesQuebec(date);
  return (Date.UTC(y, m - 1, d, h, mi, s) - date.getTime()) / 60000;
}

/** L'instant exact de minuit, heure du Québec, pour une date civile (année, mois 1-12, jour). */
export function minuitQuebec(y, m, d) {
  const naif = Date.UTC(y, m - 1, d, 0, 0, 0);
  let resultat = new Date(naif - decalageMinutes(new Date(naif)) * 60000);
  // Si un changement d'heure sépare l'estimation du résultat, un second calcul suffit.
  resultat = new Date(naif - decalageMinutes(resultat) * 60000);
  return resultat;
}

/** Lundi 00 h 00, heure du Québec, de la semaine qui contient cette date. */
export function mondayOf(date) {
  const { y, m, d } = partiesQuebec(new Date(date));
  const civil = new Date(Date.UTC(y, m - 1, d));
  const jour = civil.getUTCDay() || 7; // lundi = 1 … dimanche = 7
  civil.setUTCDate(civil.getUTCDate() - jour + 1);
  return minuitQuebec(civil.getUTCFullYear(), civil.getUTCMonth() + 1, civil.getUTCDate());
}

/** La semaine décalée de n semaines (n négatif : vers le passé), comptée sur le calendrier. */
export function decalerSemaine(weekStart, n) {
  const { y, m, d } = partiesQuebec(new Date(weekStart));
  // Midi du mercredi visé : aucun changement d'heure ne peut le faire changer de semaine.
  const milieu = new Date(Date.UTC(y, m - 1, d + 7 * n + 2, 12));
  return mondayOf(milieu);
}

/** Bornes de la semaine qui contient cette date : lundi 00 h 00 → dimanche 23 h 59 min 59 s 999. */
export function semaineDe(date) {
  const weekStart = mondayOf(date);
  const weekEnd = new Date(decalerSemaine(weekStart, 1).getTime() - 1);
  return { weekStart, weekEnd };
}

// Semaine calendaire précédente (lundi 00:00 -> dimanche 23:59:59.999), par défaut.
export function previousWeekRange(reference = new Date()) {
  return semaineDe(decalerSemaine(mondayOf(reference), -1));
}

/** Date civile au Québec, « 2026-09-27 ». Jamais l'heure du serveur. */
export function jourQuebec(date) {
  const { y, m, d } = partiesQuebec(new Date(date));
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Heure au Québec sur 24 heures, « 13:21 ». */
export function heureQuebec(date) {
  const { h, mi } = partiesQuebec(new Date(date));
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}
