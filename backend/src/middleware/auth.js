import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { aPermission } from "../lib/equipe.js";

// Relit le compte en base à chaque requête. Le jeton reste valable 30 jours : sans cette
// vérification, un compte supprimé (par la personne ou par le Dispatch) ou un administrateur
// dont on a retiré des permissions gardait tous ses accès jusqu'à l'expiration du jeton.
const findActiveUser = (id) =>
  prisma.user.findUnique({ where: { id }, select: { id: true, role: true, name: true, permissions: true, sessionVersion: true } });

/**
 * Le jeton appartient-il à la génération de sessions en cours du compte ? Changer de mot de passe
 * (ou une réinitialisation par le Dispatch) fait passer à la génération suivante : tous les jetons
 * déjà distribués cessent de fonctionner (audit du 7 octobre 2026, SEC-07). Un jeton émis avant
 * l'ajout de ce numéro n'en porte pas : il vaut génération 0, celle de tous les comptes existants.
 */
export function sessionEnCours(payload, user) {
  return (Number.isInteger(payload?.sv) ? payload.sv : 0) === (user?.sessionVersion ?? 0);
}

// Fabrique du middleware, pour pouvoir le tester avec une fausse base de données.
export function makeRequireAuth(lookupUser = findActiveUser) {
  return async function requireAuth(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Authentification requise." });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "Session invalide ou expirée." });
    }
    // Un jeton d'export (lien de téléchargement de quelques minutes) n'ouvre que l'export prévu.
    if (payload?.portee) return res.status(401).json({ error: "Session invalide ou expirée." });

    const user = typeof payload?.id === "string" ? await lookupUser(payload.id) : null;
    if (!user || !sessionEnCours(payload, user)) return res.status(401).json({ error: "Session invalide ou expirée." });

    // Rôle et permissions de la base, jamais ceux du jeton : ils ont pu changer depuis la connexion.
    req.user = { id: user.id, role: user.role, name: user.name, permissions: user.permissions || [], sessionVersion: user.sessionVersion ?? 0 };
    next();
  };
}

export const requireAuth = makeRequireAuth();

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Accès refusé pour ce rôle." });
    }
    next();
  };
}

const REFUS_PERMISSION = { error: "Accès refusé : cette fonctionnalité n'est pas autorisée pour votre compte." };

// Autorise le Dispatch (accès total, toujours) et tout autre rôle listé dans extraRoles sans
// condition (ex. le client qui crée sa propre course) ; un compte ADMIN n'est autorisé que si la
// fonctionnalité demandée fait partie des permissions choisies par le Dispatch (besoin #20).
// Les permissions sont celles de la base au moment de la requête (voir requireAuth).
export function requirePermission(permission, ...extraRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Authentification requise." });
    if (extraRoles.includes(req.user.role)) return next();
    if (aPermission(req.user, permission)) return next();
    return res.status(403).json(REFUS_PERMISSION);
  };
}

// Variante pour une lecture utile à plusieurs pages (ex. la liste des courses sert à Courses et à la
// Cédule) : il suffit d'avoir l'une des permissions.
export function requireAnyPermission(...permissions) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Authentification requise." });
    if (aPermission(req.user, ...permissions)) return next();
    return res.status(403).json(REFUS_PERMISSION);
  };
}
