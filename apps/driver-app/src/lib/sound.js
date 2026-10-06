import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { Platform } from "react-native";

// Sons joués par l'application. Depuis le 6 octobre 2026 (branche expo-audio) : expo-audio remplace
// expo-av, déprécié dans Expo SDK 54 et retiré à partir de SDK 55. expo-audio déclare d'office le
// micro et des services au premier plan sur Android : ils sont bloqués dans app.json
// (android.blockedPermissions), l'application n'enregistre jamais rien.

// "notify" = un évènement arrive (message reçu, chauffeur affecté, statut changé, récap prêt...)
// "action"  = confirmation d'une action que l'utilisateur vient de faire (message envoyé, statut avancé...)
// "alert"   = évènement urgent nécessitant une réaction rapide (course de dernière minute, rappel urgent)
const SOURCES = {
  notify: require("../../assets/sounds/notify.wav"),
  action: require("../../assets/sounds/action.wav"),
  alert: require("../../assets/sounds/alert.wav"),
};

const cache = {};
let modeRegle = false;

// iPhone en mode silencieux, ou application passée en arrière-plan : le son d'alerte doit quand
// même sortir, sinon un chauffeur rate une course diffusée. Réglé une fois, avant le premier son.
async function reglerMode() {
  if (modeRegle || Platform.OS === "web") return;
  modeRegle = true;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "duckOthers",
      interruptionModeAndroid: "duckOthers",
    });
  } catch {
    // Réglage indisponible sur cette plateforme : on joue le son quand même.
  }
}

function getPlayer(type) {
  if (!cache[type]) cache[type] = createAudioPlayer(SOURCES[type] || SOURCES.notify);
  return cache[type];
}

export async function playSound(type = "notify") {
  try {
    await reglerMode();
    const player = getPlayer(type);
    await player.seekTo(0);
    player.play();
  } catch {
    // Son indisponible (plateforme, permissions...) — on ignore silencieusement.
  }
}
