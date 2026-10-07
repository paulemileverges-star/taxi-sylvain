import { io } from "socket.io-client";

let socket;
let surRefus = null;

const jetonActuel = () => {
  try {
    return localStorage.getItem("ts_token");
  } catch {
    return null;
  }
};

/** Appelé quand le serveur refuse la connexion temps réel (session révoquée ou expirée). */
export function quandConnexionRefusee(fn) {
  surRefus = fn;
}

export function getSocket() {
  if (!socket) {
    socket = io(import.meta.env.VITE_SOCKET_URL || "http://localhost:4000", {
      // Fonction et non valeur : chaque reconnexion prend le jeton du moment (un mot de passe changé
      // donne un jeton neuf, audit du 7 octobre 2026, SEC-07).
      auth: (cb) => cb({ token: jetonActuel() }),
    });
    // Le serveur coupe les connexions d'un compte quand ses sessions sont révoquées ; il faut alors se
    // reconnecter soi-même (Socket.io ne le fait pas après une coupure décidée par le serveur).
    socket.on("disconnect", (raison) => {
      if (raison === "io server disconnect" && jetonActuel()) setTimeout(() => socket?.connect(), 1000);
    });
    socket.on("connect_error", (e) => {
      if (e?.message === "unauthorized" && surRefus) surRefus();
    });
  }
  return socket;
}

// À appeler à la déconnexion : sans ça, le socket restait connecté avec le jeton du compte
// précédent et un nouveau compte se retrouvait à recevoir/envoyer sous la mauvaise identité.
export function resetSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = undefined;
  }
}
