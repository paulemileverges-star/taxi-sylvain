#!/usr/bin/env node
// Catalogue des destinations : état, et mise en place des deux adresses de l'aéroport YUL
// (demande du propriétaire du 6 octobre 2026 : seulement les Arrivées et le stationnement P4).
// Aucune donnée personnelle : le catalogue ne contient que des adresses publiques et des prix.
//   node scripts/catalogue-yul.mjs              -> affiche le catalogue, n'écrit rien
//   node scripts/catalogue-yul.mjs --appliquer  -> pose YUL sur les Arrivées et crée le P4 s'il manque
// Le démarrage du serveur le fait déjà tout seul quand YUL garde son ancien point par défaut ; ce
// script sert si l'adresse de YUL avait été modifiée à la main dans la page Tarifs.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { YUL_ARRIVEES, YUL_P4 } from "../src/lib/aeroportYul.js";

const APPLIQUER = process.argv.includes("--appliquer");
const prisma = new PrismaClient();

async function afficher(titre) {
  console.log(`\n${titre}`);
  for (const d of await prisma.destination.findMany({ orderBy: { sortOrder: "asc" } })) {
    console.log(`  ${d.code.padEnd(6)} ${d.pointVerified ? "point vérifié    " : "point NON vérifié"}  ${d.label} — ${d.address} (${d.lat}, ${d.lng})${d.price ? ` · ${d.price} $` : ""}`);
  }
}

try {
  await afficher("Catalogue actuel :");
  if (APPLIQUER) {
    const { code, sortOrder, ...arrivees } = YUL_ARRIVEES;
    await prisma.destination.upsert({ where: { code }, update: arrivees, create: YUL_ARRIVEES });
    await prisma.destination.upsert({ where: { code: YUL_P4.code }, update: {}, create: YUL_P4 });
    await afficher("Catalogue après mise en place des deux adresses YUL :");
  } else {
    console.log("\nRien n'a été écrit. Relancer avec --appliquer pour poser YUL sur les Arrivées et créer le P4 s'il manque.");
  }
} finally {
  await prisma.$disconnect();
}
