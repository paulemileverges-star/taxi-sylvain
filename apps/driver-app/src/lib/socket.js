import { io } from "socket.io-client";
import { lireJeton } from "./session";
import { creerConnexion } from "./connexionTempsReel";

// Une seule connexion temps réel pour toute l'application (règles dans lib/connexionTempsReel.js).
const connexion = creerConnexion({
  ouvrir: (auth) => io(process.env.EXPO_PUBLIC_SOCKET_URL || "http://localhost:4000", { auth }),
  lireJeton,
});

export const { getSocket, watchRide, unwatchRide, resetSocket } = connexion;
