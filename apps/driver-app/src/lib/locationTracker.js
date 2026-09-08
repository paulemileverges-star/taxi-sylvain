import * as Location from "expo-location";
import { getSocket } from "./socket";

let watcher = null;
let trackedKey = null;

// Diffuse la position GPS du chauffeur pendant qu'il est en route pour prendre en charge
// le client ou qu'il l'amène à destination (statuts EN_ROUTE / STARTED), pour que le Dispatch
// (et le client, sur sa propre course) puissent le suivre en direct sur la carte.
export async function startTrackingLocation(rideId, rideStatus) {
  const key = `${rideId}:${rideStatus}`;
  if (trackedKey === key && watcher) return true;
  await stopTrackingLocation();

  const { status: permission } = await Location.requestForegroundPermissionsAsync();
  if (permission !== "granted") return false;

  trackedKey = key;
  watcher = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, timeInterval: 6000, distanceInterval: 20 },
    async (loc) => {
      try {
        const sock = await getSocket();
        sock.emit("driver:location", {
          rideId,
          status: rideStatus,
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
        });
      } catch {
        // Pas de réseau ou socket pas encore prêt — la prochaine mise à jour de position réessaiera.
      }
    }
  );
  return true;
}

export async function stopTrackingLocation() {
  if (watcher) {
    watcher.remove();
    watcher = null;
  }
  trackedKey = null;
}
