import { io } from "socket.io-client";

let socket;

export function getSocket() {
  if (!socket) {
    const token = localStorage.getItem("ts_token");
    socket = io(import.meta.env.VITE_SOCKET_URL || "http://localhost:4000", {
      auth: { token },
    });
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
