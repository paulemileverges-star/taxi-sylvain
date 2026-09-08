// Compte de connexions socket actives par chauffeur (un chauffeur peut avoir plusieurs
// onglets/appareils connectés) — un chauffeur est "en ligne" tant que ce compte est > 0.
const counts = new Map();

export function markDriverOnline(driverId) {
  const next = (counts.get(driverId) || 0) + 1;
  counts.set(driverId, next);
  return next === 1;
}

export function markDriverOffline(driverId) {
  const next = (counts.get(driverId) || 1) - 1;
  if (next <= 0) {
    counts.delete(driverId);
    return true;
  }
  counts.set(driverId, next);
  return false;
}

export function isDriverOnline(driverId) {
  return counts.has(driverId);
}

export function getOnlineDriverIds() {
  return new Set(counts.keys());
}
