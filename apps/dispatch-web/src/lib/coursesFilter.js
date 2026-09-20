// Filtres et pagination de la page Courses de la console. Avant le 20 septembre 2026, la page
// listait toutes les courses depuis l'origine, sans recherche ni découpage : illisible dès
// quelques centaines de courses. Règle pure, sans React, testée depuis backend/test.
export const PAGE_SIZE = 20;

export const PERIODES = [
  { key: "all", label: "Toutes les périodes" },
  { key: "today", label: "Aujourd'hui" },
  { key: "upcoming", label: "À venir (non terminées)" },
  { key: "week", label: "7 derniers jours" },
  { key: "past", label: "Terminées ou annulées" },
];

const TERMINEES = ["COMPLETED", "CANCELLED", "REFUSED"];

/** L'heure qui compte : prise en charge si planifiée, sinon création (même règle que les apps). */
export function rideMoment(ride) {
  return new Date(ride?.scheduledFor || ride?.createdAt || NaN).getTime();
}

function normaliser(texte) {
  return String(texte || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Recherche sans accents ni majuscules : client, chauffeur, adresses, numéro de vol. */
export function correspond(ride, q) {
  const cherche = normaliser(q).trim();
  if (!cherche) return true;
  return [ride.pickupAddress, ride.destAddress, ride.client?.name, ride.driver?.name, ride.flightNumber]
    .some((champ) => normaliser(champ).includes(cherche));
}

export function dansPeriode(ride, periode, now = new Date()) {
  const t = rideMoment(ride);
  const debutJour = new Date(now);
  debutJour.setHours(0, 0, 0, 0);
  const finJour = debutJour.getTime() + 86400000;
  switch (periode) {
    case "today": return t >= debutJour.getTime() && t < finJour;
    case "upcoming": return !TERMINEES.includes(ride.status);
    case "week": return t >= now.getTime() - 7 * 86400000 && t <= now.getTime();
    case "past": return TERMINEES.includes(ride.status);
    default: return true;
  }
}

/**
 * Applique les filtres puis trie : ce qui est à venir de la plus proche à la plus lointaine,
 * le reste de la plus récente à la plus ancienne. driverId « __none__ » = non assignées.
 */
export function filtrerCourses(rides, { q = "", statut = "", periode = "all", driverId = "" } = {}, now = new Date()) {
  const croissant = periode === "upcoming" || periode === "today";
  return (rides || [])
    .filter((r) => !statut || r.status === statut)
    .filter((r) => !driverId || (driverId === "__none__" ? !r.driverId : r.driverId === driverId))
    .filter((r) => dansPeriode(r, periode, now))
    .filter((r) => correspond(r, q))
    .sort((a, b) => (croissant ? rideMoment(a) - rideMoment(b) : rideMoment(b) - rideMoment(a)));
}

export function paginer(liste, page, taille = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil((liste || []).length / taille));
  const numero = Math.min(Math.max(1, Math.trunc(Number(page)) || 1), pages);
  return { items: (liste || []).slice((numero - 1) * taille, numero * taille), page: numero, pages, total: (liste || []).length };
}
