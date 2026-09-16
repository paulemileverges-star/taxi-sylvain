// Dernière position connue de chaque chauffeur en course (en mémoire, une seule instance API).
// Permet d'afficher immédiatement les chauffeurs sur la carte du Dispatch ou du client quand la
// page s'ouvre, au lieu d'attendre la prochaine mise à jour GPS.
const positions = new Map();

export function setDriverLocation(driverId, payload) {
  positions.set(driverId, payload);
}

export function clearDriverLocation(driverId) {
  return positions.delete(driverId);
}

export function getDriverLocation(driverId) {
  return positions.get(driverId) || null;
}

export function getAllDriverLocations() {
  return Array.from(positions.values());
}
