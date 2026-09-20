import { io } from "socket.io-client";
import AsyncStorage from "@react-native-async-storage/async-storage";

let socket;
// Courses suivies par cet appareil : réabonnées à chaque reconnexion (voir plus bas).
const suivies = new Set();

export async function getSocket() {
  if (!socket) {
    const token = await AsyncStorage.getItem("ts_token");
    socket = io(process.env.EXPO_PUBLIC_SOCKET_URL || "http://localhost:4000", { auth: { token } });
    // Après une coupure (tunnel, ascenseur, veille du téléphone), Socket.io se reconnecte tout
    // seul, mais le serveur a oublié nos abonnements : sans ce rappel, le suivi GPS et les messages
    // de la course ne revenaient plus tant que l'écran n'était pas fermé puis rouvert.
    socket.on("connect", () => {
      for (const rideId of suivies) socket.emit("ride:watch", rideId);
    });
  }
  return socket;
}

/** S'abonner au suivi d'une course (position, messages, étapes), reconnexions comprises. */
export async function watchRide(rideId) {
  if (!rideId) return;
  suivies.add(rideId);
  const s = await getSocket();
  s.emit("ride:watch", rideId);
}

export async function unwatchRide(rideId) {
  suivies.delete(rideId);
  if (socket && rideId) socket.emit("ride:unwatch", rideId);
}

// À appeler à la déconnexion : sans ça, le socket restait connecté avec le jeton du compte
// précédent et un nouveau compte se retrouvait à recevoir/envoyer sous la mauvaise identité.
export function resetSocket() {
  suivies.clear();
  if (socket) {
    socket.disconnect();
    socket = undefined;
  }
}
