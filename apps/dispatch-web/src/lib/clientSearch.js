// Recherche d'un client dans la page Clients de la console : nom, téléphone, courriel, adresse.
// Tout se fait dans le navigateur, sans aller-retour avec le serveur : la page a déjà la totalité
// des clients en mémoire (backend/src/routes/clients.js renvoie la liste complète).
//
// JavaScript pur : ni React, ni Vite. Il est importé tel quel par les tests du serveur.

// Même nettoyage que backend/src/lib/pricing.js (minuscules, sans accents, sans ponctuation).
// Il est recopié et non importé : le navigateur ne peut pas charger le serveur. Si l'un des deux
// change, changer l'autre.
export function normalizeText(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export const CHAMPS = [
  { cle: "nom", lire: (c) => c?.name },
  { cle: "téléphone", lire: (c) => c?.phone },
  { cle: "courriel", lire: (c) => c?.email },
  { cle: "adresse", lire: (c) => c?.address },
];

// Les mots vides après nettoyage sont jetés : taper « - » ou « @ » ne doit pas filtrer au hasard.
export function motsDeRecherche(query) {
  return String(query ?? "").split(/\s+/).map(normalizeText).filter(Boolean);
}

/**
 * null : ce client ne correspond pas. [] : la recherche est vide, tout le monde correspond.
 * Sinon : les champs qui ont fait correspondre, pour pouvoir afficher « trouvé par : adresse »
 * — sans quoi une fiche apparaît sans raison visible et passe pour un bug.
 * Chaque mot doit se retrouver quelque part chez le MÊME client, dans n'importe quel ordre.
 */
export function matchedFields(client, query) {
  const mots = motsDeRecherche(query);
  if (mots.length === 0) return [];
  const valeurs = CHAMPS.map((c) => ({ cle: c.cle, valeur: normalizeText(c.lire(client)) }));
  if (!mots.every((m) => valeurs.some((v) => v.valeur.includes(m)))) return null;
  return valeurs.filter((v) => mots.some((m) => v.valeur.includes(m))).map((v) => v.cle);
}

export function clientMatches(client, query) {
  return matchedFields(client, query) !== null;
}

export function filterClients(clients, query) {
  return (clients ?? []).filter((c) => clientMatches(c, query));
}
