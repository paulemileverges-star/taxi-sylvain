// Semaines de la console : du lundi 00 h 00 au dimanche 23 h 59, HEURE DU QUÉBEC, même règle que
// le serveur (backend/src/lib/semaines.js). Le navigateur du Dispatch peut être réglé autrement :
// les bornes ne dépendent jamais de lui.
const FUSEAU = "America/Toronto";
const FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSEAU, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function parties(date) {
  const p = Object.fromEntries(FORMAT.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, mi: Number(p.minute), s: Number(p.second) };
}

function decalage(date) {
  const { y, m, d, h, mi, s } = parties(date);
  return (Date.UTC(y, m - 1, d, h, mi, s) - date.getTime()) / 60000;
}

/** Minuit au Québec pour une date civile (mois 1-12). */
export function minuitQuebec(y, m, d) {
  const naif = Date.UTC(y, m - 1, d);
  let r = new Date(naif - decalage(new Date(naif)) * 60000);
  r = new Date(naif - decalage(r) * 60000);
  return r;
}

/** Lundi 00 h 00 (Québec) de la semaine qui contient cette date. */
export function lundiDe(date) {
  const { y, m, d } = parties(new Date(date));
  const civil = new Date(Date.UTC(y, m - 1, d));
  civil.setUTCDate(civil.getUTCDate() - (civil.getUTCDay() || 7) + 1);
  return minuitQuebec(civil.getUTCFullYear(), civil.getUTCMonth() + 1, civil.getUTCDate());
}

/** Le lundi n semaines plus tard (n négatif : plus tôt), compté sur le calendrier. */
export function decaler(lundi, n) {
  const { y, m, d } = parties(new Date(lundi));
  return lundiDe(new Date(Date.UTC(y, m - 1, d + 7 * n + 2, 12)));
}

/** Période de `nombre` semaines à partir d'un lundi : { from, to } en ISO. */
export function periodeSemaines(lundi, nombre = 1) {
  return { from: new Date(lundi).toISOString(), to: new Date(decaler(lundi, nombre).getTime() - 1).toISOString() };
}

/** Période de dates civiles « AAAA-MM-JJ » (incluses), à l'heure du Québec. */
export function periodeDates(du, au) {
  const [y1, m1, d1] = du.split("-").map(Number);
  const [y2, m2, d2] = au.split("-").map(Number);
  return { from: minuitQuebec(y1, m1, d1).toISOString(), to: new Date(minuitQuebec(y2, m2, d2 + 1).getTime() - 1).toISOString() };
}

/** « lundi 21 septembre 2026 ». */
export function dateLongue(date) {
  const { y, m, d } = parties(new Date(date));
  const jour = JOURS[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
  return `${jour} ${d} ${MOIS[m - 1]} ${y}`;
}

/** « 2026-09-21 » (Québec). */
export function jourCivil(date) {
  const { y, m, d } = parties(new Date(date));
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
