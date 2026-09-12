// Limiteur de tentatives en mémoire pour les routes d'authentification — freine les attaques
// par force brute sur les mots de passe sans dépendance externe. Suffisant pour une instance
// unique (Railway) ; à remplacer par un store partagé (Redis) si l'API est un jour répliquée.
const attempts = new Map();

export function rateLimit({ windowMs, max, keyFn }) {
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
      return res.status(429).json({ error: "Trop de tentatives. Réessayez dans quelques minutes." });
    }
    next();
  };
}

// Nettoyage périodique pour ne pas accumuler des clés mortes indéfiniment.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) if (now - entry.start > 60 * 60 * 1000) attempts.delete(key);
}, 10 * 60 * 1000).unref();
