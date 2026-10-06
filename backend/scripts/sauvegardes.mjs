#!/usr/bin/env node
// Sauvegardes de la base, côté serveur (voir src/lib/sauvegarde.js). Se lance dans le conteneur :
//   railway ssh --service backend -- sh -c "cd /app && node scripts/sauvegardes.mjs liste"
//   ... node scripts/sauvegardes.mjs maintenant      -> fait une sauvegarde tout de suite
//   ... node scripts/sauvegardes.mjs transmettre [n] -> écrit la sauvegarde n (la plus récente par
//       défaut) en base64 entre deux repères, avec son empreinte SHA-256 ; c'est ce que lit
//       scripts/recuperer-sauvegarde.mjs (racine du dépôt) pour en garder une copie sur le PC.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { faireSauvegarde, sauvegardesDir, trierSauvegardes } from "../src/lib/sauvegarde.js";
import { prisma } from "../src/lib/prisma.js";

const [commande = "liste", nom] = process.argv.slice(2);
const presentes = () => { try { return trierSauvegardes(fs.readdirSync(sauvegardesDir)); } catch { return []; } };

try {
  if (commande === "liste") {
    const liste = presentes();
    if (liste.length === 0) console.log("Aucune sauvegarde.");
    for (const f of liste) console.log(`${f}  ${Math.round(fs.statSync(path.join(sauvegardesDir, f)).size / 1024)} Ko`);
  } else if (commande === "maintenant") {
    const r = await faireSauvegarde();
    console.log(`Sauvegarde faite : ${r.fichier} (${Math.round(r.octets / 1024)} Ko)`);
    for (const [table, n] of Object.entries(r.comptes)) console.log(`  ${table} : ${n}`);
  } else if (commande === "transmettre") {
    const choisi = nom || presentes()[0];
    if (!choisi || !presentes().includes(choisi)) { console.error("Sauvegarde introuvable :", choisi || "(aucune)"); process.exit(2); }
    const donnees = fs.readFileSync(path.join(sauvegardesDir, choisi));
    const empreinte = crypto.createHash("sha256").update(donnees).digest("hex");
    process.stdout.write(`-----DEBUT ${choisi}-----\n${donnees.toString("base64").replace(/.{1,76}/g, "$&\n")}-----FIN ${empreinte}-----\n`);
  } else {
    console.error("Commande inconnue. Utiliser : liste, maintenant ou transmettre [nom].");
    process.exit(2);
  }
} finally {
  await prisma.$disconnect();
}
