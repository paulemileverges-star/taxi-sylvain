// Confirmation du courriel d'un nouveau compte par un code à six chiffres.
//
// Demande du propriétaire : « les créations de nouveaux comptes chauffeurs et clients devront se
// faire par authentification ou confirmation de code envoyé par courriel ». Concrètement :
//   - un client qui s'inscrit lui-même reçoit un code et ne peut rien faire avant de l'avoir saisi ;
//   - un chauffeur ou un client créé par le Dispatch reçoit son code à sa PREMIÈRE connexion, avec
//     le mot de passe temporaire que le Dispatch lui a transmis ;
//   - un compte sans vrai courriel (réservation par téléphone) n'a rien à confirmer ;
//   - tant qu'aucun service de courriel n'est configuré, personne n'est bloqué.
//
// Le code n'est jamais stocké en clair (empreinte), il expire, et les essais sont comptés.
// Les règles sont des fonctions pures, testables sans base de données ; l'accès à la base et
// l'envoi du courriel sont injectables.

import crypto from "crypto";
import { prisma } from "./prisma.js";
import { isMailConfigured, sendMail } from "./mailer.js";
import { realEmailOrNull } from "./placeholderEmail.js";

export const CODE_VALIDITE_MS = 15 * 60 * 1000;
export const DELAI_RENVOI_MS = 60 * 1000;
export const TENTATIVES_MAX = 5;

export function genererCode(aleatoire = crypto.randomInt) {
  return String(aleatoire(0, 1000000)).padStart(6, "0");
}

export function hacherCode(code, userId) {
  return crypto.createHash("sha256").update(`${userId}:${String(code).trim()}`).digest("hex");
}

export function formatDeCodeValide(code) {
  return typeof code === "string" && /^\d{6}$/.test(code.trim());
}

/**
 * Faut-il confirmer le courriel de ce compte avant de le laisser entrer ?
 * Le Dispatch (le propriétaire) n'est jamais bloqué : c'est lui qui débloque les autres.
 */
export function confirmationRequise(user, { mailConfigure = isMailConfigured() } = {}) {
  if (!user || user.emailVerifiedAt) return false;
  if (user.role === "DISPATCH") return false;
  if (!realEmailOrNull(user.email)) return false;
  if (!mailConfigure) return false;
  return true;
}

/** « valide », « invalide », « expire », « bloque » (trop d'essais) ou « absent ». */
export function etatDuCode(entree, code, now = new Date()) {
  if (!entree) return "absent";
  if (new Date(now).getTime() > new Date(entree.expiresAt).getTime()) return "expire";
  if (entree.attempts >= TENTATIVES_MAX) return "bloque";
  if (!formatDeCodeValide(code)) return "invalide";
  return hacherCode(code, entree.userId) === entree.codeHash ? "valide" : "invalide";
}

/** Un nouveau code ne part pas si le précédent a moins d'une minute : ça évite les rafales. */
export function renvoiTropTot(entree, now = new Date()) {
  return Boolean(entree && new Date(now).getTime() - new Date(entree.sentAt).getTime() < DELAI_RENVOI_MS);
}

export function messageDuCode({ nom, code }) {
  const prenom = String(nom || "").trim().split(/\s+/)[0] || "";
  const bonjour = prenom ? `Bonjour ${prenom},` : "Bonjour,";
  const minutes = Math.round(CODE_VALIDITE_MS / 60000);
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f3f4f6;font-family:Segoe UI,Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#16233a;color:#f5a623;padding:16px 20px;border-radius:12px 12px 0 0;font-size:18px;font-weight:700">Taxi Sylvain</div>
  <div style="background:#ffffff;padding:20px;border-radius:0 0 12px 12px">
    <p style="margin:0 0 12px;color:#111827;font-size:15px">${bonjour}</p>
    <p style="margin:0 0 12px;color:#111827;font-size:15px">Voici votre code de confirmation pour l'application Taxi Sylvain :</p>
    <p style="margin:0 0 16px;font-size:32px;letter-spacing:8px;font-weight:700;color:#16233a">${code}</p>
    <p style="margin:0;color:#6b7280;font-size:13px">Ce code est valable ${minutes} minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce courriel.</p>
  </div>
</div></body></html>`;
  const text = `${bonjour}\n\nVotre code de confirmation Taxi Sylvain : ${code}\n\nIl est valable ${minutes} minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce courriel.`;
  return { subject: `Votre code de confirmation Taxi Sylvain : ${code}`, html, text };
}

/**
 * Génère un code, l'enregistre (empreinte) et l'envoie par courriel.
 * Renvoie { envoye: true } ou { envoye: false, raison } sans jamais lever.
 */
export async function demanderCode(user, { db = prisma, envoyer = sendMail, now = new Date(), forcer = false, aleatoire } = {}) {
  const adresse = realEmailOrNull(user?.email);
  if (!adresse) return { envoye: false, raison: "sans-courriel" };

  const existante = await db.emailVerification.findUnique({ where: { userId: user.id } });
  if (!forcer && renvoiTropTot(existante, now)) return { envoye: false, raison: "trop-tot" };

  const code = genererCode(aleatoire);
  const data = { codeHash: hacherCode(code, user.id), expiresAt: new Date(now.getTime() + CODE_VALIDITE_MS), attempts: 0, sentAt: now };
  await db.emailVerification.upsert({ where: { userId: user.id }, update: data, create: { userId: user.id, ...data } });

  const { subject, html, text } = messageDuCode({ nom: user.name, code });
  const resultat = await envoyer({ to: adresse, toName: user.name, subject, html, text });
  if (!resultat?.ok) return { envoye: false, raison: resultat?.error || "envoi-echoue" };
  return { envoye: true };
}

/**
 * Vérifie le code saisi. Renvoie l'état (« valide » marque le compte confirmé et efface le code).
 * Un essai raté est compté ; au-delà de TENTATIVES_MAX, il faut demander un nouveau code.
 */
export async function verifierCode(user, code, { db = prisma, now = new Date() } = {}) {
  const entree = await db.emailVerification.findUnique({ where: { userId: user.id } });
  const etat = etatDuCode(entree, code, now);
  if (etat === "valide") {
    await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: now } });
    await db.emailVerification.deleteMany({ where: { userId: user.id } });
    return etat;
  }
  if (etat === "invalide") {
    await db.emailVerification.update({ where: { userId: user.id }, data: { attempts: { increment: 1 } } });
  }
  return etat;
}

/** Message montré à la personne selon l'état du code. */
export function messagePourEtat(etat) {
  switch (etat) {
    case "valide": return "Courriel confirmé. Bienvenue chez Taxi Sylvain.";
    case "expire": return "Ce code a expiré. Demandez un nouveau code.";
    case "bloque": return "Trop d'essais. Demandez un nouveau code.";
    case "absent": return "Aucun code en attente. Demandez un nouveau code.";
    default: return "Code incorrect. Vérifiez les six chiffres reçus par courriel.";
  }
}
