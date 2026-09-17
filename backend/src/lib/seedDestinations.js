import { prisma } from "./prisma.js";

// Destinations prédéfinies proposées à la création d'une course. Créées si absentes au démarrage ;
// le Dispatch les corrige ensuite (adresse, tarif) depuis la page Tarifs de la console.
const DEFAULTS = [
  { code: "YUL", label: "Aéroport Montréal-Trudeau (YUL)", address: "975 Boul. Roméo-Vachon N, Dorval, QC H4Y 1H1", lat: 45.4706, lng: -73.7408, sortOrder: 1 },
  { code: "YHU", label: "Aéroport de Saint-Hubert (YHU)", address: "5700 Route de l'Aéroport, Longueuil, QC J3Y 8Y9", lat: 45.5175, lng: -73.4169, sortOrder: 2 },
  { code: "REM", label: "Station REM (boulevard de Rome)", address: "Boulevard de Rome, Brossard, QC J4X 2A4", lat: 45.4564461, lng: -73.4716479, sortOrder: 3 },
];

// Adresse du REM corrigée le 2026-09-17 : la station desservie est celle du boulevard de Rome à
// Brossard, pas Bois-Franc. On remplace l'ancienne valeur si elle est encore en base, sans écraser
// une adresse que le Dispatch aurait saisie lui-même depuis la page Tarifs.
const OUTDATED_REM_ADDRESS = "Station Bois-Franc, Boul. Henri-Bourassa O, Montréal, QC";

export async function ensureDefaultDestinations() {
  for (const d of DEFAULTS) {
    await prisma.destination.upsert({ where: { code: d.code }, update: {}, create: d });
  }
  await prisma.destination.updateMany({
    where: { code: "REM", address: OUTDATED_REM_ADDRESS },
    data: { label: "Station REM (boulevard de Rome)", address: "Boulevard de Rome, Brossard, QC J4X 2A4", lat: 45.4564461, lng: -73.4716479 },
  });
  // Si l’adresse avait déjà été modifiée à la main, le libellé pouvait rester « Bois-Franc » :
  // on corrige alors le libellé seul, sans toucher à l’adresse saisie par le Dispatch.
  await prisma.destination.updateMany({
    where: { code: "REM", label: { contains: "Bois-Franc" } },
    data: { label: "Station REM (boulevard de Rome)" },
  });
}
