import { Platform } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSocket } from "./socket";

// Diffuse la position GPS du chauffeur pendant qu'il est en route pour prendre en charge le client
// ou qu'il l'amène à destination (statuts EN_ROUTE / STARTED), pour que le Dispatch et le client
// puissent le suivre en direct sur la carte.
//
// Le contexte de la course est gardé en mémoire (`context`) ET dans AsyncStorage : la mémoire sert
// au suivi normal, le stockage sert à la tâche de fond native qui s'exécute dans un autre contexte
// JavaScript. Attention : `startTrackingLocation` ne doit jamais appeler `stopTrackingLocation`,
// qui efface ce contexte — c'était le bug qui empêchait toute position de partir sur le web.
const TASK = "taxi-sylvain-location";
const CONTEXT_KEY = "ts_tracking_context";

let context = null; // { rideId, status }
let webWatcher = null;
let started = false;

async function currentContext() {
  if (context) return context;
  const raw = await AsyncStorage.getItem(CONTEXT_KEY);
  return raw ? JSON.parse(raw) : null;
}

async function emitPosition(coords) {
  const ctx = await currentContext();
  if (!ctx || !coords) return;
  try {
    const sock = await getSocket();
    sock.emit("driver:location", {
      rideId: ctx.rideId,
      status: ctx.status,
      lat: coords.latitude,
      lng: coords.longitude,
    });
  } catch {
    // Pas de réseau ou socket pas encore prêt — la prochaine position réessaiera.
  }
}

if (Platform.OS !== "web") {
  TaskManager.defineTask(TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    await emitPosition(data.locations[data.locations.length - 1].coords);
  });
}

// Envoie une position tout de suite, sans attendre le premier relevé du suivi continu.
function sendCurrentPosition() {
  Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
    .then((loc) => emitPosition(loc.coords))
    .catch(() => null);
}

export async function startTrackingLocation(rideId, rideStatus) {
  context = { rideId, status: rideStatus };
  await AsyncStorage.setItem(CONTEXT_KEY, JSON.stringify(context));

  const { status: foreground } = await Location.requestForegroundPermissionsAsync();
  if (foreground !== "granted") return false;

  if (started) {
    sendCurrentPosition(); // changement d'étape : on repart avec une position fraîche
    return true;
  }

  if (Platform.OS === "web") {
    started = true;
    sendCurrentPosition();
    webWatcher = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 10 },
      (loc) => emitPosition(loc.coords)
    );
    startWebKeepAlive();
    return true;
  }

  // La permission « en arrière-plan » est facultative : sans elle, le suivi s'arrête quand l'app
  // n'est plus à l'écran, mais reprend dès qu'elle revient au premier plan.
  await Location.requestBackgroundPermissionsAsync().catch(() => null);

  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);
  if (!alreadyRunning) {
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 5000,
      distanceInterval: 15,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Taxi Sylvain — course en cours",
        notificationBody: "Votre position est partagée avec le Dispatch pendant la course.",
        notificationColor: "#f5a623",
      },
    });
  }
  started = true;
  sendCurrentPosition();
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
    // Non supporté ou refusé — le suivi continue simplement tant que l'onglet est actif.
  }
}

function startWebKeepAlive() {
  if (typeof document === "undefined") return;
  requestWakeLock();
  if (!visibilityHandler) {
    visibilityHandler = () => {
      if (document.visibilityState !== "visible" || !started) return;
      requestWakeLock();
      sendCurrentPosition();
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
  context = null;
  started = false;
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
