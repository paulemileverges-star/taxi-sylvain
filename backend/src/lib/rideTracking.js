// Relais de la position GPS vers le suivi d'une course : seulement si ce chauffeur est bien celui
// de la course, et seulement pendant les étapes « En route » et « Course démarrée ».
//
// Sans cette vérification, un chauffeur à qui Taxi Sylvain avait retiré la course continuait
// d'envoyer sa position vers le suivi de cette course, jusqu'à la mise à jour de son application :
// le client pouvait voir l'ancien chauffeur sur sa carte (relecture du 19 septembre 2026).

export const TRACKED_STATUSES = ["EN_ROUTE", "STARTED"];

// Les positions arrivent toutes les quelques secondes : l'affectation de la course est gardée en
// mémoire quelques secondes pour ne pas interroger la base à chaque position.
export function makeAssignmentCheck(lookupRide, { ttlMs = 15000, now = () => Date.now() } = {}) {
  const cache = new Map();
  return async function isCurrentDriver(rideId, driverId) {
    if (typeof rideId !== "string" || !rideId || typeof driverId !== "string") return false;
    let entry = cache.get(rideId);
    if (!entry || now() - entry.at > ttlMs) {
      const ride = await lookupRide(rideId);
      entry = { driverId: ride?.driverId ?? null, status: ride?.status ?? null, at: now() };
      cache.set(rideId, entry);
      if (cache.size > 5000) cache.delete(cache.keys().next().value); // borne la mémoire
    }
    return entry.driverId === driverId && TRACKED_STATUSES.includes(entry.status);
  };
}
