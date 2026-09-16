import { prisma } from "./prisma.js";

// Destinations prédéfinies proposées à la création d'une course. Créées si absentes au démarrage ;
// le Dispatch les corrige ensuite (adresse, tarif) depuis la page Tarifs de la console.
const DEFAULTS = [
  { code: "YUL", label: "Aéroport Montréal-Trudeau (YUL)", address: "975 Boul. Roméo-Vachon N, Dorval, QC H4Y 1H1", lat: 45.4706, lng: -73.7408, sortOrder: 1 },
  { code: "YHU", label: "Aéroport de Saint-Hubert (YHU)", address: "5700 Route de l'Aéroport, Longueuil, QC J3Y 8Y9", lat: 45.5175, lng: -73.4169, sortOrder: 2 },
  { code: "REM", label: "Station REM Bois-Franc", address: "Station Bois-Franc, Boul. Henri-Bourassa O, Montréal, QC", lat: 45.5279, lng: -73.6862, sortOrder: 3 },
];

export async function ensureDefaultDestinations() {
  for (const d of DEFAULTS) {
    await prisma.destination.upsert({ where: { code: d.code }, update: {}, create: d });
  }
}
