#!/usr/bin/env node
// Copie sur le PC de la dernière sauvegarde de la base (copie hors de Railway). À lancer à la
// racine du dépôt, sur le PC où la CLI Railway est connectée et la clé SSH enregistrée (§ 6 de
// docs/PASSATION.md) :
//   node scripts/recuperer-sauvegarde.mjs                 -> rapatrie la plus récente
//   node scripts/recuperer-sauvegarde.mjs --maintenant    -> en fait une d'abord, puis la rapatrie
//   node scripts/recuperer-sauvegarde.mjs --dossier "D:\Sauvegardes"
// Dossier par défaut : OneDrive\Documents\Livrables Taxi-Sylvain Claude\10-Sauvegardes. Le fichier
// est vérifié (empreinte SHA-256, décompression, nombre de lignes de chaque table) avant d'être
// gardé. Il contient des renseignements personnels : le garder dans un endroit protégé.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backend = path.join(racine, "backend");
const argDossier = process.argv.indexOf("--dossier");
const dossier = argDossier > 0 ? process.argv[argDossier + 1] : path.join(os.homedir(), "OneDrive", "Documents", "Livrables Taxi-Sylvain Claude", "10-Sauvegardes");

// Sous Windows, la CLI installée par npm est un raccourci railway.cmd que Node ne lance pas sans
// passer par cmd.exe (qui couperait la commande distante au « && ») : on vise railway.exe directement.
export function executableRailway(env = process.env, plateforme = process.platform) {
  if (env.RAILWAY_BIN) return env.RAILWAY_BIN;
  if (plateforme === "win32") {
    for (const dir of (env.PATH || env.Path || "").split(path.delimiter).filter(Boolean)) {
      for (const candidat of [path.join(dir, "node_modules", "@railway", "cli", "bin", "railway.exe"), path.join(dir, "railway.exe")]) {
        if (fs.existsSync(candidat)) return candidat;
      }
    }
  }
  return "railway";
}

if (process.argv.includes("--version-railway")) {
  const r = spawnSync(executableRailway(), ["--version"], { encoding: "utf8", windowsHide: true });
  console.log(executableRailway(), "->", (r.stdout || r.error?.message || "").trim());
  process.exit(r.status ?? 1);
}

function serveur(commande) {
  const r = spawnSync(executableRailway(), ["ssh", "--service", "backend", "--", "sh", "-c", `cd /app && node scripts/sauvegardes.mjs ${commande}`], {
    cwd: backend, encoding: "utf8", maxBuffer: 200 * 1024 * 1024, windowsHide: true,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`railway ssh a échoué (${r.status}) : ${(r.stderr || r.stdout || "").slice(0, 500)}`);
  return r.stdout;
}

if (process.argv.includes("--maintenant")) console.log(serveur("maintenant").trim());

const sortie = serveur("transmettre").replace(/\r/g, "");
const m = sortie.match(/-----DEBUT (taxi-sylvain-[\w-]+\.json\.gz)-----\n([\s\S]*?)-----FIN ([0-9a-f]{64})-----/);
if (!m) {
  console.error("Réponse du serveur illisible :", sortie.slice(0, 500));
  process.exit(1);
}
const [, nom, base64, empreinte] = m;
const donnees = Buffer.from(base64.replace(/\s+/g, ""), "base64");
if (crypto.createHash("sha256").update(donnees).digest("hex") !== empreinte) {
  console.error("Copie abîmée pendant le transfert (empreinte différente) : rien n'a été écrit. Relancer.");
  process.exit(1);
}
// Import tardif : la vérification utilise le même lecteur que la restauration.
const { lireFichierSauvegarde } = await import(new URL("../backend/src/lib/sauvegarde.js", import.meta.url));
const contenu = lireFichierSauvegarde(donnees);
fs.mkdirSync(dossier, { recursive: true });
const destination = path.join(dossier, nom);
fs.writeFileSync(destination, donnees);
const lignes = Object.values(contenu.comptes).reduce((a, b) => a + b, 0);
console.log(`Copie vérifiée : ${destination} (${Math.round(donnees.length / 1024)} Ko, ${Object.keys(contenu.tables).length} tables, ${lignes} lignes, sauvegarde du ${contenu.creeLe}).`);
process.exit(0);
