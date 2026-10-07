// Une base de données est-elle une base LOCALE d'essai ? Sert de garde aux scripts qui créent des
// comptes de démonstration (audit du 7 octobre 2026, SEC-18) : lancé par erreur avec l'adresse de la
// base de production, prisma/seed.js créait un compte Dispatch au mot de passe connu.
const HOTES_LOCAUX = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function baseLocale(adresse, env = process.env) {
  if (env.NODE_ENV === "production" || env.RAILWAY_ENVIRONMENT || env.RAILWAY_PROJECT_ID) return false;
  try {
    const url = new URL(String(adresse || ""));
    return /^postgres(ql)?:$/.test(url.protocol) && HOTES_LOCAUX.has(url.hostname);
  } catch {
    return false;
  }
}
