#!/usr/bin/env node
// Publication d'un site web sur Vercel, à utiliser à la place de « vercel --prod --yes » :
//   node scripts/publier-web.mjs dispatch
//   node scripts/publier-web.mjs chauffeur
//   node scripts/publier-web.mjs client
//
// Ce que fait le script (audit du 7 octobre 2026, OPS-04) :
//   1. refuse de publier du code non commité : la version en ligne doit correspondre à un commit ;
//   2. vérifie que la CLI Vercel est connectée (piège du 20 septembre 2026) ;
//   3. publie en inscrivant le commit dans la construction (affiché en bas de l'application, et
//      contrôlé par scripts/verifier-mise-en-ligne.mjs) ;
//   4. pour le client, refait l'alias taxi-sylvain-client.vercel.app (piège décrit dans PASSATION) ;
//   5. lance la vérification de la mise en ligne.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { APPLICATIONS_WEB, RACINE, commitWeb } from "./versions-web.mjs";

const cle = process.argv[2];
const app = APPLICATIONS_WEB[cle];
if (!app) {
  console.error(`Usage : node scripts/publier-web.mjs ${Object.keys(APPLICATIONS_WEB).join(" | ")}`);
  process.exit(2);
}
const dossier = path.join(RACINE, app.dossier);

// shell: true pour trouver vercel.cmd sous Windows ; les arguments viennent de ce script seul.
function vercel(args, stdio = "inherit") {
  return spawnSync("vercel", args, { cwd: dossier, encoding: "utf8", shell: true, stdio });
}

const etat = spawnSync("git", ["status", "--porcelain", "--", app.dossier], { cwd: RACINE, encoding: "utf8" });
if (etat.status !== 0) {
  console.error("Git est indisponible : publication annulée.");
  process.exit(1);
}
if (etat.stdout.trim()) {
  console.error(`Modifications non commitées dans ${app.dossier} :\n${etat.stdout}`);
  console.error("Commiter d'abord : la version en ligne doit correspondre à un commit du dépôt.");
  process.exit(1);
}
const commit = commitWeb(cle);
if (!commit) {
  console.error(`Aucun commit trouvé pour ${app.dossier} : publication annulée.`);
  process.exit(1);
}

if (vercel(["whoami"], ["ignore", "ignore", "ignore"]).status !== 0) {
  console.error("La CLI Vercel n'est pas connectée sur ce PC : lancer « vercel login », puis recommencer.");
  process.exit(1);
}

console.log(`Publication de ${cle} depuis ${app.dossier}, commit ${commit}…`);
const publication = vercel(["--prod", "--yes", "--build-env", `${app.variable}=${commit}`], ["inherit", "pipe", "inherit"]);
if (publication.status !== 0) {
  console.error("La publication a échoué (voir les messages de Vercel ci-dessus).");
  process.exit(1);
}
const adresse = (publication.stdout.match(/https:\/\/[^\s]+\.vercel\.app/g) || []).pop();
console.log(`Déploiement : ${adresse || "adresse non lue"}`);

if (app.alias) {
  if (!adresse) {
    console.error(`Adresse du déploiement non lue : poser l'alias à la main (vercel alias set <adresse> ${app.alias}).`);
    process.exit(1);
  }
  if (vercel(["alias", "set", adresse, app.alias]).status !== 0) {
    console.error(`L'alias ${app.alias} n'a pas pu être posé : l'ancienne adresse reste sur l'ancienne version.`);
    process.exit(1);
  }
}

console.log("\nVérification de la mise en ligne :\n");
const verification = spawnSync(process.execPath, [path.join(RACINE, "scripts", "verifier-mise-en-ligne.mjs")], { cwd: RACINE, stdio: "inherit" });
process.exit(verification.status ?? 1);
