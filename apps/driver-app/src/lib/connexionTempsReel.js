// Gestion de LA connexion temps réel de l'application (JavaScript pur, sans React Native : testé par
// backend/test/connexionTempsReel.test.js). Voir lib/socket.js pour le branchement réel.
//
// Audit du 7 octobre 2026 (F01) : getSocket attendait la lecture du jeton AVANT de retenir la
// connexion ; trois appels simultanés à l'ouverture créaient trois connexions, et la déconnexion
// n'en fermait qu'une (messages en double, notifications de l'ancien compte sur un appareil
// partagé). Désormais une seule connexion, partagée par tous les appels, même simultanés, et la
// déconnexion du compte abandonne aussi une connexion en cours d'établissement.

// Rendue à un écran qui demandait la connexion au moment où le compte se déconnectait : il peut s'y
// abonner sans erreur, il ne recevra rien.
export const SOCKET_INACTIF = { on() {}, off() {}, emit() {}, connected: false };

/**
 * `ouvrir(auth)` crée la connexion Socket.io ; `lireJeton()` rend le jeton du moment (promesse).
 */
export function creerConnexion({ ouvrir, lireJeton }) {
  let socket;
  let enCours = null;
  // Incrémentée à chaque déconnexion de compte : une connexion lancée AVANT est abandonnée.
  let generation = 0;
  // Courses suivies par cet appareil : réabonnées à chaque reconnexion.
  const suivies = new Set();

  async function getSocket() {
    if (socket) return socket;
    if (enCours) return enCours;
    const maGeneration = generation;
    enCours = (async () => {
      await lireJeton();
      if (maGeneration !== generation) return SOCKET_INACTIF;
      // Fonction et non valeur : chaque reconnexion prend le jeton du moment (un mot de passe
      // changé donne un jeton neuf, SEC-07).
      const s = ouvrir((cb) => { lireJeton().then((token) => cb({ token })).catch(() => cb({})); });
      // Après une coupure (tunnel, ascenseur, veille du téléphone), Socket.io se reconnecte tout
      // seul, mais le serveur a oublié nos abonnements : on les renouvelle.
      s.on("connect", () => {
        for (const rideId of suivies) s.emit("ride:watch", rideId);
      });
      // Coupure décidée par le serveur (sessions révoquées) : Socket.io ne se reconnecte pas seul.
      s.on("disconnect", (raison) => {
        if (raison === "io server disconnect") setTimeout(() => { if (socket === s) s.connect(); }, 1000);
      });
      socket = s;
      return s;
    })();
    try {
      return await enCours;
    } finally {
      enCours = null;
    }
  }

  /** S'abonner au suivi d'une course (position, messages, étapes), reconnexions comprises. */
  async function watchRide(rideId) {
    if (!rideId) return;
    suivies.add(rideId);
    const s = await getSocket();
    s.emit("ride:watch", rideId);
  }

  function unwatchRide(rideId) {
    suivies.delete(rideId);
    if (socket && rideId) socket.emit("ride:unwatch", rideId);
  }

  // À appeler à la déconnexion : sans ça, le socket restait connecté avec le jeton du compte
  // précédent et un nouveau compte se retrouvait à recevoir sous la mauvaise identité.
  function resetSocket() {
    generation += 1;
    suivies.clear();
    enCours = null;
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = undefined;
    }
  }

  return { getSocket, watchRide, unwatchRide, resetSocket };
}
