import { io } from "socket.io-client";
import AsyncStorage from "@react-native-async-storage/async-storage";

let socket;

export async function getSocket() {
  if (!socket) {
    const token = await AsyncStorage.getItem("ts_token");
    socket = io(process.env.EXPO_PUBLIC_SOCKET_URL || "http://localhost:4000", { auth: { token } });
  }
  return socket;
}

// À appeler à la déconnexion : sans ça, le socket restait connecté avec le jeton du compte
// précédent et un nouveau compte se retrouvait à recevoir/envoyer sous la mauvaise identité.
export function resetSocket() {
  if (socket) {
    socket.disconnect();
    socket = undefined;
  }
}
