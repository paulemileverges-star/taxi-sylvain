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
