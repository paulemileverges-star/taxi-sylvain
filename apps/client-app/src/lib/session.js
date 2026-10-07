// Jeton de session de l'application, rangé dans le coffre du téléphone (Keychain sur iPhone,
// Keystore sur Android) grâce à expo-secure-store, et non plus dans le stockage ordinaire
// (audit du 7 octobre 2026, F14). La version web, sans coffre, garde le stockage du navigateur.
// Un jeton laissé par une version précédente (stockage ordinaire) est déplacé dans le coffre à la
// première lecture : personne n'est déconnecté par la mise à jour.
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const CLE = "ts_token";
let coffre = null;
if (Platform.OS !== "web") {
  try {
    coffre = require("expo-secure-store");
  } catch {
    coffre = null; // module absent (ancienne compilation) : stockage ordinaire
  }
}

export async function lireJeton() {
  if (coffre) {
    try {
      const jeton = await coffre.getItemAsync(CLE);
      if (jeton) return jeton;
      const ancien = await AsyncStorage.getItem(CLE);
      if (ancien) {
        await coffre.setItemAsync(CLE, ancien);
        await AsyncStorage.removeItem(CLE);
      }
      return ancien;
    } catch {
      // Coffre indisponible sur cet appareil : repli sur le stockage ordinaire.
    }
  }
  return AsyncStorage.getItem(CLE);
}

export async function ecrireJeton(jeton) {
  if (coffre) {
    try {
      await coffre.setItemAsync(CLE, jeton);
      await AsyncStorage.removeItem(CLE);
      return;
    } catch {
      // repli ci-dessous
    }
  }
  await AsyncStorage.setItem(CLE, jeton);
}

export async function effacerJeton() {
  if (coffre) {
    try {
      await coffre.deleteItemAsync(CLE);
    } catch {
      // rien à effacer
    }
  }
  await AsyncStorage.removeItem(CLE);
}
