// Heures et dates affichées dans l'application : toujours sur 24 heures (« 13:21 ») et à l'heure de
// Montréal (demande du propriétaire du 6 octobre 2026 : la console affichait 13:21, l'application
// « 1:21 PM » selon la langue du téléphone). Si le téléphone ne connaît pas les fuseaux horaires,
// on prend son heure locale, toujours sur 24 heures.
const FUSEAU = "America/Toronto";
const deux = (n) => String(n).padStart(2, "0");

let format = null;
function parties(date) {
  try {
    format = format || new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    const p = {};
    for (const x of format.formatToParts(date)) p[x.type] = x.value;
    if (!p.year || !p.hour) throw new Error("format incomplet");
    return { y: p.year, m: p.month, d: p.day, h: deux(Number(p.hour) % 24), mi: p.minute };
  } catch {
    return { y: String(date.getFullYear()), m: deux(date.getMonth() + 1), d: deux(date.getDate()), h: deux(date.getHours()), mi: deux(date.getMinutes()) };
  }
}

const lisible = (valeur) => {
  if (!valeur) return null;
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** « 13:21 », ou « — ». */
export function heure(valeur) {
  const date = lisible(valeur);
  if (!date) return "—";
  const p = parties(date);
  return `${p.h}:${p.mi}`;
}

/** « 2026-10-06 », ou « — ». */
export function jour(valeur) {
  const date = lisible(valeur);
  if (!date) return "—";
  const p = parties(date);
  return `${p.y}-${p.m}-${p.d}`;
}

// Décalage (minutes) entre l'heure de Montréal et le temps universel à cet instant.
function decalageMontreal(instant) {
  const p = parties(instant);
  return (Date.UTC(Number(p.y), Number(p.m) - 1, Number(p.d), Number(p.h), Number(p.mi)) - Math.floor(instant.getTime() / 60000) * 60000) / 60000;
}

/**
 * Date (« AAAA-MM-JJ ») et heure (« HH:MM ») choisies dans l'application, lues comme heure DE
 * MONTRÉAL, été comme hiver, quel que soit le réglage du téléphone (audit du 7 octobre 2026, F03 :
 * un voyageur dont le téléphone était à l'heure de Paris réservait six heures trop tôt). Instant ISO,
 * ou null si la saisie est illisible.
 */
export function heureMontrealVersIso(date, temps) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  const t = /^(\d{2}):(\d{2})$/.exec(String(temps || ""));
  if (!m || !t) return null;
  const naif = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(t[1]), Number(t[2]));
  if (Number.isNaN(naif)) return null;
  let r = new Date(naif - decalageMontreal(new Date(naif)) * 60000);
  r = new Date(naif - decalageMontreal(r) * 60000);
  return r.toISOString();
}
