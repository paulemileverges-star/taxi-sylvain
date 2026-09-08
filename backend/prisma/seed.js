// Crée des comptes de démonstration. Lancer avec : npm run seed
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const password = await bcrypt.hash("password123", 10);

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

  console.log("Comptes de démonstration créés (mot de passe : password123)");
}

main().finally(() => prisma.$disconnect());
