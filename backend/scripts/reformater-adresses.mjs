#!/usr/bin/env node
// Remise en forme des adresses déjà enregistrées (fiches clients et courses non terminées) à la
// forme unique de Taxi Sylvain (voir src/lib/addressFormat.js, cleanAddressText). Les nouvelles
// adresses sont mises en forme à la saisie depuis le 20 septembre 2026 ; ce script rattrape
// l'existant, une fois. À lancer depuis backend/ :
//   node scripts/reformater-adresses.mjs                         -> montre ce qui changerait, n'écrit rien
//   node scripts/reformater-adresses.mjs --appliquer             -> écrit (base locale seulement)
//   node scripts/reformater-adresses.mjs --appliquer --production -> écrit sur une base distante
// Garde-fous : sans --appliquer rien n'est écrit ; une base qui n'est pas sur localhost exige
// --production en plus ; une adresse dont la mise en forme changerait la municipalité reconnue
// (donc le prix du catalogue) n'est jamais touchée et est listée à part.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { cleanAddressText } from "../src/lib/addressFormat.js";
import { matchZone } from "../src/lib/pricing.js";

const APPLIQUER = process.argv.includes("--appliquer");
const PRODUCTION = process.argv.includes("--production");
const locale = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || "");
if (APPLIQUER && !locale && !PRODUCTION) {
  console.error("ARRÊT : la base configurée n'est pas locale. Ajoutez --production si c'est voulu.");
  process.exit(2);
}

const prisma = new PrismaClient();
const zones = await prisma.priceZone.findMany();
const TERMINEES = ["COMPLETED", "CANCELLED", "REFUSED"];
let modifiees = 0;
let refusees = 0;
let inchangees = 0;

/** Nouvelle forme, ou null si rien ne change ou si la municipalité reconnue changerait. */
function proposer(texte) {
  const propre = cleanAddressText(texte);
  if (!propre || propre === texte) { inchangees += 1; return null; }
  const avant = matchZone(texte, zones)?.name || null;
  const apres = matchZone(propre, zones)?.name || null;
  if (avant !== apres) {
    refusees += 1;
    console.log(`REFUSÉ (municipalité ${avant || "?"} -> ${apres || "?"}) : ${texte}`);
    return null;
  }
  modifiees += 1;
  console.log(`${APPLIQUER ? "ÉCRIT " : "SERAIT"} : ${texte}\n        -> ${propre}`);
  return propre;
}

console.log(`${APPLIQUER ? "APPLICATION" : "SIMULATION (rien n'est écrit)"} sur ${locale ? "la base locale" : "une base DISTANTE"}\n`);

console.log("--- Fiches clients ---");
const clients = await prisma.user.findMany({ where: { role: "CLIENT", address: { not: null } }, select: { id: true, address: true } });
for (const c of clients) {
  const nouvelle = proposer(c.address);
  if (nouvelle && APPLIQUER) await prisma.user.update({ where: { id: c.id }, data: { address: nouvelle } });
}

console.log("\n--- Courses non terminées ---");
const rides = await prisma.ride.findMany({ where: { status: { notIn: TERMINEES } }, select: { id: true, pickupAddress: true, destAddress: true } });
for (const r of rides) {
  const data = {};
  const depart = proposer(r.pickupAddress);
  const arrivee = proposer(r.destAddress);
  if (depart) data.pickupAddress = depart;
  if (arrivee) data.destAddress = arrivee;
  if (Object.keys(data).length && APPLIQUER) await prisma.ride.update({ where: { id: r.id }, data });
}

console.log(`\nBilan : ${modifiees} adresse(s) ${APPLIQUER ? "réécrite(s)" : "à réécrire"}, ${refusees} refusée(s) (prix protégé), ${inchangees} déjà propre(s).`);
await prisma.$disconnect();
