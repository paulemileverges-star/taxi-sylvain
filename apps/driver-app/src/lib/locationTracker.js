import { Platform } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSocket } from "./socket";

// Diffuse la position GPS du chauffeur pendant qu'il est en route pour prendre en charge le
// client ou qu'il l'amène à destination (statuts EN_ROUTE / STARTED), pour que le Dispatch (et
// le client, sur sa propre course) puissent le suivre en direct sur la carte.
//
// Sur Android/iOS, le suivi continue quand l'app passe en arrière-plan — indispensable puisque le
// chauffeur navigue avec Waze ou Google Maps au premier plan : une tâche de fond (expo-task-
// manager) reçoit les positions et une notification persistante Android maintient le service
// actif. Sur le web, on retombe sur un simple suivi au premier plan.
const TASK = "taxi-sylvain-location";
const CONTEXT_KEY = "ts_tracking_context";

let webWatcher = null;
let trackedKey = null;

async function emitPosition(coords) {
  const raw = await AsyncStorage.getItem(CONTEXT_KEY);
  if (!raw) return;
  const { rideId, status } = JSON.parse(raw);
  try {
    const sock = await getSocket();
    sock.emit("driver:location", { rideId, status, lat: coords.latitude, lng: coords.longitude });
  } catch {
    // Pas de réseau ou socket pas encore prêt — la prochaine position réessaiera.
  }
}

if (Platform.OS !== "web") {
  TaskManager.defineTask(TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const last = data.locations[data.locations.length - 1];
    await emitPosition(last.coords);
  });
}

export async function startTrackingLocation(rideId, rideStatus) {
  const key = `${rideId}:${rideStatus}`;
  await AsyncStorage.setItem(CONTEXT_KEY, JSON.stringify({ rideId, status: rideStatus }));
  if (trackedKey === key) return true;

  const { status: foreground } = await Location.requestForegroundPermissionsAsync();
  if (foreground !== "granted") return false;

  if (Platform.OS === "web") {
    await stopTrackingLocation();
    trackedKey = key;
    // Première position tout de suite (sans attendre le premier « tick » du suivi) pour que le
    // chauffeur apparaisse sur la carte dès qu'il glisse « En route ».
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      .then((loc) => emitPosition(loc.coords))
      .catch(() => null);
    webWatcher = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 10 },
      (loc) => emitPosition(loc.coords)
    );
    startWebKeepAlive();
    return true;
  }

  // La permission "en arrière-plan" est facultative : sans elle, le suivi s'arrête quand l'app
  // n'est plus à l'écran, mais reprend dès qu'elle revient au premier plan.
  await Location.requestBackgroundPermissionsAsync().catch(() => null);

  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);
  if (!alreadyRunning) {
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 6000,
      distanceInterval: 20,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Taxi Sylvain — course en cours",
        notificationBody: "Votre position est partagée avec le Dispatch pendant la course.",
        notificationColor: "#f5a623",
      },
    });
  }
  trackedKey = key;
  return true;
}

// Version web : un navigateur suspend la géolocalisation quand l'écran s'éteint ou que l'onglet
// passe en arrière-plan. On garde l'écran allumé pendant la course (Wake Lock) et, au retour au
// premier plan, on renvoie immédiatement une position pour rattraper le silence.
let wakeLock = null;
let visibilityHandler = null;

async function requestWakeLock() {
  try {
    if (typeof navigator !== "undefined" && navigator.wakeLock && !wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener?.("release", () => { wakeLock = null; });
    }
  } catch {
    // Non supporté ou refusé — le suivi continue simplement tant que l'onglet reste actif.
  }
}

function startWebKeepAlive() {
  if (typeof document === "undefined") return;
  requestWakeLock();
  if (!visibilityHandler) {
    visibilityHandler = () => {
      if (document.visibilityState !== "visible" || !trackedKey) return;
      requestWakeLock();
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
        .then((loc) => emitPosition(loc.coords))
        .catch(() => null);
    };
    document.addEventListener("visibilitychange", visibilityHandler);
  }
}

function stopWebKeepAlive() {
  if (wakeLock) { wakeLock.release?.().catch?.(() => null); wakeLock = null; }
  if (visibilityHandler && typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", visibilityHandler);
    visibilityHandler = null;
  }
}

export async function stopTrackingLocation() {
  trackedKey = null;
  await AsyncStorage.removeItem(CONTEXT_KEY);
  if (webWatcher) {
    webWatcher.remove();
    webWatcher = null;
  }
  stopWebKeepAlive();
  if (Platform.OS !== "web") {
    const running = await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);
    if (running) await Location.stopLocationUpdatesAsync(TASK).catch(() => null);
  }
}
