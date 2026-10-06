// Heures et dates affichées dans la console : toujours sur 24 heures (« 13:21 ») et à l'heure de
// Montréal, quel que soit le réglage de l'ordinateur (demande du propriétaire du 6 octobre 2026 :
// « que cela soit le cas partout où l'heure est indiquée »). Avant, toLocaleTimeString suivait la
// langue du navigateur et pouvait afficher « 1:21 PM ».
const FUSEAU = "America/Toronto";

let format = null;
function parties(date) {
  try {
    format ??= new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    const p = Object.fromEntries(format.formatToParts(date).map((x) => [x.type, x.value]));
    return { y: p.year, m: p.month, d: p.day, h: String(Number(p.hour) % 24).padStart(2, "0"), mi: p.minute };
  } catch {
    // Navigateur sans fuseaux horaires : heure de l'ordinateur, toujours sur 24 heures.
    const deux = (n) => String(n).padStart(2, "0");
    return { y: String(date.getFullYear()), m: deux(date.getMonth() + 1), d: deux(date.getDate()), h: deux(date.getHours()), mi: deux(date.getMinutes()) };
  }
}

/** « 13:21 » ; « — » si la date est absente ou illisible. */
export function heure(valeur) {
  if (!valeur) return "—";
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return "—";
  const p = parties(date);
  return `${p.h}:${p.mi}`;
}

/** « 2026-10-06 » ; « — » si la date est absente ou illisible. */
export function jour(valeur) {
  if (!valeur) return "—";
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return "—";
  const p = parties(date);
  return `${p.y}-${p.m}-${p.d}`;
}

/** « 2026-10-06 13:21 ». */
export function jourHeure(valeur) {
  return valeur ? `${jour(valeur)} ${heure(valeur)}` : "—";
}
