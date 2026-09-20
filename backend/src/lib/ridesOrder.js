// Ordre et découpage en journées des listes de courses paginées (onglets « À venir » et
// « Courses passées » des applications chauffeur et client).
//
// Avant le 20 septembre 2026, ces listes étaient triées par heure de SAISIE : une course entrée ce
// matin pour dans trois semaines passait devant une course entrée la semaine dernière pour demain.
// Comme le tri sert aussi à découper les pages, aucune correction faite dans l'application ne
// pouvait rattraper cela : la page 1 contenait déjà les mauvaises courses.
//
// Fichier volontairement sans Prisma ni Express : c'est une règle métier, elle doit pouvoir être
// testée sans base de données.

// Taxi Sylvain travaille au Québec. Une journée commence et finit à l'heure du Québec, jamais à
// celle du serveur (Railway tourne en UTC) ni à celle du téléphone : sans ce point fixe, une course
// de 23 h 30 basculerait au lendemain. Seule constante à changer si l'entreprise opère ailleurs.
export const FUSEAU_TAXI = "America/Toronto";

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

// On ne demande au système que des chiffres, jamais du texte : les noms français sont écrits ici,
// pour que l'étiquette soit la même quelle que soit la langue du serveur ou du téléphone.
const PARTIES = new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU_TAXI, year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * L'heure qui compte pour une course : l'heure de prise en charge si elle est planifiée, sinon
 * l'heure de création (course immédiate). Même convention que la Cédule et les écrans.
 * Renvoie null si aucune date n'est lisible.
 */
export function rideMoment(ride) {
  const t = new Date(ride?.scheduledFor ?? ride?.createdAt ?? NaN).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Journée d'une course : clé triable (« 2026-09-21 ») et titre affichable (« lundi 21 septembre »). */
export function rideDay(ride) {
  const t = rideMoment(ride);
  if (t === null) return { dayKey: "", dayLabel: "Date inconnue" };
  const p = Object.fromEntries(PARTIES.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  const dayKey = `${p.year}-${p.month}-${p.day}`;
  // Midi UTC de cette date : un changement d'heure ne peut pas la faire basculer d'un jour.
  const jour = JOURS[new Date(`${dayKey}T12:00:00Z`).getUTCDay()];
  return { dayKey, dayLabel: `${jour} ${Number(p.day)} ${MOIS[Number(p.month) - 1]}` };
}

function departage(a, b) {
  const ia = String(a?.id ?? "");
  const ib = String(b?.id ?? "");
  return ia < ib ? -1 : ia > ib ? 1 : 0;
}

/**
 * « À venir » : de la plus proche à la plus lointaine.
 * « Passées » : la journée la plus récente d'abord, et à l'intérieur d'une journée les heures
 * croissantes, comme on lit une colonne de la Cédule.
 * Le départage final par identifiant est indispensable : sans lui, deux courses à la même heure
 * peuvent changer de place entre la requête de la page 1 et celle de la page 2, et une course
 * disparaîtrait ou apparaîtrait deux fois.
 */
export function compareRides(a, b, when) {
  const ta = rideMoment(a);
  const tb = rideMoment(b);
  if (ta === null || tb === null) {
    if (ta === tb) return departage(a, b);
    return ta === null ? 1 : -1; // date illisible : reléguée en fin de liste, jamais de NaN
  }
  if (when === "past") {
    const ja = rideDay(a).dayKey;
    const jb = rideDay(b).dayKey;
    if (ja !== jb) return ja < jb ? 1 : -1;
  }
  if (ta !== tb) return ta - tb;
  return departage(a, b);
}

/**
 * Tri, découpage en pages et total, au même endroit : la route appelle exactement cette fonction,
 * donc le test qui l'appelle teste bien ce que fait la route.
 */
export function pageDeCourses(rides, { when, page, pageSize } = {}) {
  const taille = Math.min(Math.max(Math.trunc(Number(pageSize)) || 10, 1), 50);
  const numero = Math.max(Math.trunc(Number(page)) || 1, 1);
  const triees = [...rides].sort((a, b) => compareRides(a, b, when));
  const debut = (numero - 1) * taille;
  return {
    rides: triees.slice(debut, debut + taille).map((r) => ({ ...r, ...rideDay(r) })),
    total: rides.length,
    page: numero,
    pageSize: taille,
  };
}
