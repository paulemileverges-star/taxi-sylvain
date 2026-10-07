// Une même demande envoyée deux fois (double clic, réseau lent qui fait réessayer) ne doit créer
// qu'une course (audit du 7 octobre 2026, F05). Le formulaire joint une clé tirée au hasard pour
// chaque saisie ; tant que le serveur a cette clé en mémoire (10 minutes), une seconde demande
// identique reçoit le résultat de la première au lieu d'en créer une autre, même si elle arrive
// pendant que la première est encore en cours. Mémoire locale : suffisant pour une instance unique.
const traitements = new Map();
export const DUREE_CLE_MS = 10 * 60 * 1000;

/** Clé acceptée : 8 à 100 caractères simples ; sinon pas d'idempotence (null). */
export function cleValide(cle) {
  return typeof cle === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(cle) ? cle : null;
}

function purger(maintenant) {
  for (const [k, v] of traitements) if (v.expire < maintenant) traitements.delete(k);
}

/**
 * Exécute fn une seule fois par (compte, clé). Renvoie { resultat, rejoue } ; rejoue = true quand le
 * résultat vient d'une demande précédente. Une erreur libère la clé : on peut réessayer.
 */
export async function unSeulTraitement(compteId, cle, fn, { maintenant = Date.now() } = {}) {
  const valide = cleValide(cle);
  if (!valide) return { resultat: await fn(), rejoue: false };
  purger(maintenant);
  const k = `${compteId}|${valide}`;
  const existant = traitements.get(k);
  if (existant) return { resultat: await existant.promesse, rejoue: true };
  const promesse = fn();
  traitements.set(k, { promesse, expire: maintenant + DUREE_CLE_MS });
  try {
    return { resultat: await promesse, rejoue: false };
  } catch (e) {
    traitements.delete(k);
    throw e;
  }
}

// Pour les tests.
export function oublierTraitements() {
  traitements.clear();
}
