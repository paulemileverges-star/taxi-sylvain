// Limiteur de tentatives en mémoire pour les routes d'authentification — freine les attaques
// par force brute sur les mots de passe sans dépendance externe. Suffisant pour une instance
// unique (Railway) ; à remplacer par un store partagé (Redis) si l'API est un jour répliquée.
const attempts = new Map();

const TROP = "Trop de tentatives. Réessayez dans quelques minutes.";

export function rateLimit({ windowMs, max, keyFn, message = TROP }) {
  return (req, res, next) => {
    const now = Date.now();
    const key = keyFn(req);
    const entry = attempts.get(key);
    if (entry && now - entry.start > windowMs) attempts.delete(key);

    const current = attempts.get(key) || { start: now, count: 0 };
    current.count += 1;
    attempts.set(key, current);

    if (current.count > max) {
      const retryAfter = Math.ceil((current.start + windowMs - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

// Quota par compte connecté (audit du 7 octobre 2026, SEC-14) : géocodage, réservations, messages,
// abonnements aux notifications... Chaque appel peut coûter (Google, courriels, notifications) ou
// écrire en base : au-delà du budget, réponse 429, sans gêner les autres comptes. À placer après
// requireAuth ; sans compte connu, l'adresse IP sert de clé.
export function quotaParCompte(nom, { windowMs, max, message = "Trop de demandes en peu de temps. Patientez un instant puis réessayez." }) {
  return rateLimit({ windowMs, max, message, keyFn: (req) => `quota|${nom}|${req.user?.id || req.ip}` });
}

// Pour les tests : repartir de compteurs vides.
export function viderCompteurs() {
  attempts.clear();
}

// Nettoyage périodique pour ne pas accumuler des clés mortes indéfiniment.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) if (now - entry.start > 60 * 60 * 1000) attempts.delete(key);
}, 10 * 60 * 1000).unref();
