// Version des sites web : le dernier commit qui a changé le code web d'une application. Partagé par
// la publication (scripts/publier-web.mjs, qui l'inscrit dans la construction) et par la
// surveillance (scripts/verifier-mise-en-ligne.mjs, qui vérifie que le site en ligne le porte).
// Audit du 7 octobre 2026 (OPS-04) : comparer deux adresses entre elles ne disait pas si le code en
// ligne était celui du dépôt.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// variable : nom de la variable de construction lue par l'application (voir src/lib/version.js).
// alias : adresse posée à la main sur un déploiement précis, à refaire à chaque publication.
export const APPLICATIONS_WEB = {
  dispatch: { dossier: "apps/dispatch-web", variable: "VITE_VERSION_WEB", alias: null },
  chauffeur: { dossier: "apps/driver-app", variable: "EXPO_PUBLIC_VERSION_WEB", alias: null },
  client: { dossier: "apps/client-app", variable: "EXPO_PUBLIC_VERSION_WEB", alias: "taxi-sylvain-client.vercel.app" },
};

// Fichiers sans effet sur la version web (compilations iPhone et Android seulement) : les changer
// ne demande pas de republier le site.
const HORS_WEB = ["eas.json", "google-services.json", "GoogleService-Info.plist", "plugins"];

export function cheminsWeb(dossier) {
  return [dossier, ...HORS_WEB.map((f) => `:(exclude)${dossier}/${f}`)];
}

/** Les 12 premiers caractères du dernier commit qui a changé le code web de l'application, ou null. */
export function commitWeb(cle) {
  const app = APPLICATIONS_WEB[cle];
  if (!app) return null;
  try {
    const sha = execFileSync("git", ["log", "-1", "--format=%H", "--", ...cheminsWeb(app.dossier)], { cwd: RACINE, encoding: "utf8" }).trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha.slice(0, 12) : null;
  } catch {
    return null;
  }
}

/** Historique complet ? Dans un clone superficiel (GitHub Actions par défaut), le calcul est faux. */
export function historiqueComplet() {
  try {
    return execFileSync("git", ["rev-parse", "--is-shallow-repository"], { cwd: RACINE, encoding: "utf8" }).trim() === "false";
  } catch {
    return false;
  }
}
