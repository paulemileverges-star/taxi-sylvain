#!/usr/bin/env node
// Déchiffre la copie hebdomadaire d'une sauvegarde reçue par courriel (fichier « .chiffre »), pour
// obtenir la sauvegarde ordinaire (.json.gz) que lisent restaurer-sauvegarde.mjs et
// scripts/comparer-rapports.mjs. Audit du 7 octobre 2026 (SEC-15) : copie automatique hors de Railway.
//
// La clé n'est jamais écrite sur la ligne de commande (elle resterait dans l'historique) : elle est
// lue dans la variable d'environnement SAUVEGARDE_CLE, ou demandée au clavier.
//   cd backend
//   node scripts/dechiffrer-sauvegarde.mjs "C:\chemin\taxi-sylvain-2026-10-11-0330.json.gz.chiffre"
// Résultat : le même nom sans « .chiffre », dans le même dossier, après vérification complète.
import fs from "node:fs";
import readline from "node:readline";
import { cleCopieExterne, dechiffrerSauvegarde, lireFichierSauvegarde } from "../src/lib/sauvegarde.js";

const fichier = process.argv[2];
if (!fichier || !fichier.endsWith(".chiffre")) {
  console.error('Usage : node scripts/dechiffrer-sauvegarde.mjs "<fichier .chiffre>"');
  process.exit(2);
}

async function demanderCle() {
  if (process.env.SAUVEGARDE_CLE) return process.env.SAUVEGARDE_CLE;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const cle = await new Promise((r) => rl.question("Clé de la copie externe (SAUVEGARDE_CLE) : ", r));
  rl.close();
  return cle;
}

const cle = cleCopieExterne(await demanderCle());
if (!cle) {
  console.error("Clé invalide : 32 octets encodés en base64 attendus (la valeur de SAUVEGARDE_CLE dans Railway).");
  process.exit(1);
}
let donnees;
try {
  donnees = dechiffrerSauvegarde(fs.readFileSync(fichier), cle);
} catch (e) {
  console.error("Déchiffrement impossible : mauvaise clé, ou fichier abîmé.", e.message);
  process.exit(1);
}
const contenu = lireFichierSauvegarde(donnees); // complète et cohérente, sinon erreur explicite
const sortie = fichier.slice(0, -".chiffre".length);
fs.writeFileSync(sortie, donnees, { flag: "wx" });
const lignes = Object.values(contenu.comptes || {}).reduce((t, n) => t + n, 0);
console.log(`Sauvegarde déchiffrée et vérifiée : ${sortie} (${Object.keys(contenu.tables).length} tables, ${lignes} lignes, du ${contenu.creeLe}).`);
