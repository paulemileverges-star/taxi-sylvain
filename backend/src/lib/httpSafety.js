// Filet de sécurité du serveur.
//
// Express 4 ne rattrape pas les erreurs des routes « async » : une seule promesse rejetée (compte
// introuvable, mot de passe envoyé sous forme de nombre, base momentanément indisponible...)
// arrêtait tout le processus Node, donc l'API pour tout le monde. La relecture du 19 septembre
// 2026 l'a reproduit, y compris avec une simple requête anonyme sur la page de connexion.
//
// IMPORTANT : "express-async-errors" doit être importé AVANT la déclaration des routes. Il enrobe
// chaque route au moment où elle est créée ; une route déclarée avant l'import resterait fragile.
// C'est pourquoi index.js importe ce fichier en tout premier.
import "express-async-errors";
import { signalerErreur } from "./alertes.js";

// Dernier middleware : toute erreur non traitée devient une réponse propre au lieu d'un plantage.
export function installErrorHandler(app) {
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);

    // Erreurs dues à la requête elle-même, pas au serveur.
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Requête invalide." });
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "Requête trop volumineuse." });
    if (err?.name === "MulterError") {
      const message = err.code === "LIMIT_FILE_SIZE" ? "Fichier trop volumineux." : "Fichier refusé.";
      return res.status(400).json({ error: message });
    }

    // Chemin sans les paramètres : l'adresse de téléchargement des récapitulatifs contient le jeton
    // de connexion (?token=...), qui ne doit jamais se retrouver dans les journaux.
    // Journalisée et envoyée par courriel à la personne technique (lib/alertes.js).
    signalerErreur(`Erreur non traitée sur ${req.method} ${req.baseUrl || ""}${req.path}`, err);
    res.status(500).json({ error: "Erreur interne du serveur. Réessayez dans un instant." });
  });
}

// Promesses lancées sans attendre leur résultat (notifications push, courriels...) : une erreur
// y est journalisée et signalée au lieu d'arrêter le serveur.
export function installProcessGuards() {
  process.on("unhandledRejection", (reason) => {
    signalerErreur("Promesse rejetée non traitée", reason);
  });
  // Erreur hors de toute requête : l'état du processus n'est plus sûr. On prévient (5 secondes au
  // plus pour le courriel), puis on s'arrête : Railway redémarre le service tout seul.
  process.on("uncaughtException", (err) => {
    const delai = new Promise((resolve) => setTimeout(resolve, 5000));
    Promise.race([signalerErreur("Arrêt du serveur sur une erreur imprévue (redémarrage automatique par Railway)", err), delai])
      .finally(() => process.exit(1));
  });
}
