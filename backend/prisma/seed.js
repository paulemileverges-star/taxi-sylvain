// Crée des comptes de démonstration sur une base LOCALE d'essai. Lancer avec : npm run seed
//
// Audit du 7 octobre 2026 (SEC-18) : le script créait trois comptes, dont un compte Dispatch, avec un
// mot de passe commun écrit ici même, sans vérifier la base visée. Désormais :
//   - il refuse toute base qui n'est pas sur cette machine (localhost), et tout environnement de
//     production ou Railway, AVANT de se connecter ;
//   - le mot de passe est tiré au hasard à chaque lancement et affiché une seule fois.
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { baseLocale } from "../src/lib/baseLocale.js";

if (!baseLocale(process.env.DATABASE_URL)) {
  console.error("Refusé : les comptes de démonstration ne se créent que sur une base locale (localhost), jamais en production.");
  process.exit(1);
}
const { prisma } = await import("../src/lib/prisma.js");

async function main() {
  const motDePasse = crypto.randomBytes(9).toString("base64url");
  const password = await bcrypt.hash(motDePasse, 10);

  await prisma.user.upsert({
    where: { email: "dispatch@taxi-sylvain.com" },
    update: {},
    create: {
      role: "DISPATCH",
      name: "Taxi Sylvain — Centrale",
      email: "dispatch@taxi-sylvain.com",
      phone: "+15145550000",
      passwordHash: password,
    },
  });

  await prisma.user.upsert({
    where: { email: "mamadou@example.com" },
    update: {},
    create: {
      role: "DRIVER",
      name: "Mamadou Diallo",
      email: "mamadou@example.com",
      phone: "+15145550001",
      passwordHash: password,
      carModel: "Toyota Camry 2021",
      plate: "T45 KLM",
    },
  });

  await prisma.user.upsert({
    where: { email: "client@example.com" },
    update: {},
    create: {
      role: "CLIENT",
      name: "Client Démo",
      email: "client@example.com",
      phone: "+15145550002",
      passwordHash: password,
    },
  });

  console.log(`Comptes de démonstration créés sur la base locale (mot de passe de cette fois : ${motDePasse}).`);
  console.log("Un compte qui existait déjà garde son ancien mot de passe.");
}

main().finally(() => prisma.$disconnect());
