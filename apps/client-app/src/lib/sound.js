import { Audio } from "expo-av";
import { Platform } from "react-native";

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
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: true, shouldDuckAndroid: true });
  } catch {
    // Réglage indisponible sur cette plateforme : on joue le son quand même.
  }
}

async function getSound(type) {
  if (cache[type]) return cache[type];
  const { sound } = await Audio.Sound.createAsync(SOURCES[type] || SOURCES.notify);
  cache[type] = sound;
  return sound;
}

export async function playSound(type = "notify") {
  try {
    await reglerMode();
    const sound = await getSound(type);
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch {
    // Son indisponible (plateforme, permissions...) — on ignore silencieusement.
  }
}
