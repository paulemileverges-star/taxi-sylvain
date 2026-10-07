// Ordre de la Cédule : classement des courses et des créneaux d'une même journée, du plus tôt au
// plus tard. Avant le 20 septembre 2026, la Cédule affichait les courses dans l'ordre où elles
// avaient été SAISIES (le serveur les renvoie de la plus récente à la plus ancienne), puis les
// créneaux en dessous : une course de 6 h se retrouvait sous une course de 22 h, et un créneau du
// matin sous une course du soir.
//
// Ce fichier est du JavaScript PUR : aucun React, aucun JSX, aucune variable de compilation.
// Il est importé tel quel par les tests du serveur (backend/test/scheduleOrder.test.js).
//
// Audit du 7 octobre 2026 (F11) : les jours suivaient le calendrier de L'ORDINATEUR. Depuis un
// ordinateur réglé sur Paris, une course du samedi 23 h 30 (heure du Québec) tombait dans la colonne
// du dimanche tout en affichant 23:30. Les jours et les semaines suivent désormais le calendrier du
// Québec, comme les Rapports (lib/semaines.js), quel que soit le réglage de l'ordinateur.
import { lundiDe, minuitQuebec, jourCivil } from "./semaines.js";

/** Lundi 00 h 00 (Québec) de la semaine qui contient cette date. */
export function startOfWeek(d) {
  return lundiDe(d);
}

// Arithmétique de CALENDRIER, et non d'horloge : « + 7 jours » n'est pas « + 7 × 86 400 000 ms ».
// Aux changements d'heure (8 mars et 1er novembre au Québec), la journée dure 23 h ou 25 h, et
// l'ancien calcul décalait toute la grille d'un jour, voire faisait disparaître une course.
export function addDays(date, n) {
  const [y, m, j] = jourCivil(date).split("-").map(Number);
  return minuitQuebec(y, m, j + n);
}

/** Même jour du calendrier du Québec (et non même intervalle de 24 h). */
export function sameCivilDay(a, b) {
  return jourCivil(a) === jourCivil(b);
}

/** « 21/9 » : jour et mois du Québec, pour l'en-tête d'une colonne. */
export function jourMois(date) {
  const [, m, j] = jourCivil(date).split("-").map(Number);
  return `${j}/${m}`;
}

// Heure qui fait foi : le créneau a son heure de début ; la course a son heure de prise en charge,
// et à défaut son heure de création (convention déjà en place dans Courses.jsx et calendar.js).
// Une date absente ou illisible renvoie l'infini : l'élément finit en bas de la journée, jamais
// en tête comme le ferait une date de 1970.
export function scheduleItemTime(item) {
  const brut = item?.kind === "slot" ? item.entry?.startsAt : item?.ride?.scheduledFor ?? item?.ride?.createdAt;
  const t = Date.parse(brut);
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

// Renvoie un NOUVEAU tableau : « rides » et « entries » sont des états React, les trier sur place
// provoquerait des affichages incohérents. À heure égale, la course passe avant le créneau, puis on
// départage par identifiant, pour que l'ordre ne change pas d'un rafraîchissement à l'autre.
export function sortScheduleItems(items) {
  return [...items].sort((a, b) => {
    const diff = scheduleItemTime(a) - scheduleItemTime(b);
    if (diff !== 0) return diff;
    if (a.kind !== b.kind) return a.kind === "ride" ? -1 : 1;
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * Les éléments d'une journée de la semaine affichée, courses et créneaux mélangés, classés par
 * heure. L'identifiant est préfixé (« ride-… », « slot-… ») : les deux tables ont leurs propres
 * numéros, et React a besoin d'une clé unique dans une liste unique.
 */
export function scheduleItemsForDay({ rides = [], entries = [], weekStart, dayIndex }) {
  const jour = addDays(weekStart, dayIndex);
  const items = [
    ...rides.map((ride) => ({ kind: "ride", id: `ride-${ride.id}`, ride })),
    ...entries.map((entry) => ({ kind: "slot", id: `slot-${entry.id}`, entry })),
  ].filter((item) => {
    const t = scheduleItemTime(item);
    return Number.isFinite(t) && sameCivilDay(new Date(t), jour);
  });
  return sortScheduleItems(items);
}
