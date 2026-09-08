import { Audio } from "expo-av";

// "notify" = un évènement arrive (message reçu, chauffeur affecté, récap prêt...)
// "action"  = confirmation d'une action que l'utilisateur vient de faire (message envoyé, statut avancé...)
// "alert"   = évènement urgent nécessitant une réaction rapide (course de dernière minute à saisir)
const SOURCES = {
  notify: require("../../assets/sounds/notify.wav"),
  action: require("../../assets/sounds/action.wav"),
  alert: require("../../assets/sounds/alert.wav"),
};

const cache = {};

async function getSound(type) {
  if (cache[type]) return cache[type];
  const { sound } = await Audio.Sound.createAsync(SOURCES[type] || SOURCES.notify);
  cache[type] = sound;
  return sound;
}

export async function playSound(type = "notify") {
  try {
    const sound = await getSound(type);
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch {
    // Son indisponible (plateforme, permissions...) — on ignore silencieusement.
  }
}
