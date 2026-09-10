import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentification requise." });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, role, name }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session invalide ou expirée." });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Accès refusé pour ce rôle." });
    }
    next();
  };
}

// Autorise le Dispatch (accès total, toujours) et tout autre rôle listé dans extraRoles sans
// condition (ex. le client qui crée sa propre course) ; un compte ADMIN n'est autorisé que si la
// fonctionnalité demandée fait partie des permissions choisies par le Dispatch à sa création
// (besoin #20). Les permissions viennent du jeton JWT (User.permissions au moment de la connexion).
export function requirePermission(permission, ...extraRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Authentification requise." });
    if (req.user.role === "DISPATCH") return next();
    if (extraRoles.includes(req.user.role)) return next();
    if (req.user.role === "ADMIN" && Array.isArray(req.user.permissions) && req.user.permissions.includes(permission)) {
      return next();
    }
    return res.status(403).json({ error: "Accès refusé : cette fonctionnalité n'est pas autorisée pour votre compte." });
  };
}
