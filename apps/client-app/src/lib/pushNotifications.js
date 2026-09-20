import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { api } from "./api";

// Sans ça, un chauffeur ne reçoit une nouvelle course que si l'app est ouverte à l'écran —
// voir le bilan de projet. Les notifications push (Expo) marchent même app fermée / écran
// verrouillé. Web et simulateur ne supportent pas les push : on n'y fait simplement rien.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotifications() {
  if (Platform.OS === "web" || !Device.isDevice) return null;

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return null;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Notifications Taxi Sylvain",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
      });
      // Canal « urgence » : nouvelle course diffusée et rappel d’une heure avant. Importance
      // maximale, vibration longue, visible sur l’écran verrouillé : le téléphone doit réveiller
      // le chauffeur, pas seulement afficher une ligne discrète.
      await Notifications.setNotificationChannelAsync("urgence", {
        name: "Urgences Taxi Sylvain (nouvelle course, rappel urgent)",
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
        vibrationPattern: [0, 400, 200, 400, 200, 400],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
      });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.registerPushToken(token);
    return token;
  } catch (err) {
    console.warn("Notifications push indisponibles :", err.message);
    return null;
  }
}

export async function clearPushToken() {
  try {
    await api.clearPushToken();
  } catch {
    // La déconnexion doit réussir même si l'appel réseau échoue.
  }
}
