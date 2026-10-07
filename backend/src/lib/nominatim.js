// Accès au serveur public Nominatim (OpenStreetMap), utilisé seulement tant que la clé Google Maps
// n'est pas posée.
//
// Audit du 7 octobre 2026 (OPS-02) : la politique d'utilisation du serveur public impose au plus UNE
// requête par seconde pour toute l'application, un User-Agent qui identifie l'application, et
// demande de mettre les résultats en cache (https://operations.osmfoundation.org/policies/nominatim/).
// Ici :
//   - une file unique espace les requêtes d'au moins 1,1 seconde, tous comptes confondus ;
//   - au-delà de quelques demandes en attente, les suivantes reçoivent une réponse vide (« service
//     occupé ») au lieu de s'empiler ;
//   - les réponses sont gardées 24 heures (même recherche = aucune nouvelle requête).
// La réponse définitive reste la clé Google Maps, prévue pour l'autocomplétion.
export const INTERVALLE_MS = 1100;
export const ATTENTE_MAX = 3;
const CACHE_MAX = 500;
const CACHE_DUREE_MS = 24 * 60 * 60 * 1000;
export const USER_AGENT = "TaxiSylvain/1.0 (+https://taxisylvain.ca; contact@taxisylvain.ca)";

const cache = new Map(); // clé -> { expire, valeur }
let prochainCreneau = 0;
let enAttente = 0;

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Exécute fn() dans le respect du rythme d'une requête par seconde. Renvoie null sans rien appeler
 * si trop de demandes attendent déjà. `horloge` et `attendre` sont injectables pour les tests.
 */
export async function auRythme(fn, { horloge = Date.now, attendre = pause } = {}) {
  if (enAttente >= ATTENTE_MAX) return null;
  enAttente += 1;
  try {
    const maintenant = horloge();
    const creneau = Math.max(maintenant, prochainCreneau);
    prochainCreneau = creneau + INTERVALLE_MS;
    if (creneau > maintenant) await attendre(creneau - maintenant);
    return await fn();
  } finally {
    enAttente -= 1;
  }
}

/** Recherche Nominatim (paramètres URLSearchParams), avec cache et rythme. null si indisponible. */
export async function rechercherNominatim(params, { fetchImpl = fetch } = {}) {
  const cle = params.toString();
  const garde = cache.get(cle);
  if (garde && garde.expire > Date.now()) return garde.valeur;
  const valeur = await auRythme(async () => {
    try {
      const res = await fetchImpl(`https://nominatim.openstreetmap.org/search?${cle}`, {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "fr" },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  });
  if (Array.isArray(valeur)) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(cle, { expire: Date.now() + CACHE_DUREE_MS, valeur });
  }
  return valeur;
}

// Pour les tests.
export function reinitialiserNominatim() {
  cache.clear();
  prochainCreneau = 0;
  enAttente = 0;
}
