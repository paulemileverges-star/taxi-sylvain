import { prisma } from "./prisma.js";
import { YUL_ARRIVEES, YUL_P4, ANCIEN_POINT_YUL } from "./aeroportYul.js";

// Destinations prédéfinies proposées à la création d'une course. Créées si absentes au démarrage ;
// le Dispatch les corrige ensuite (adresse, tarif) depuis la page Tarifs de la console.
const DEFAULTS = [
  YUL_ARRIVEES,
  YUL_P4,
  { code: "YHU", label: "Aéroport de Saint-Hubert (YHU)", address: "5700 Route de l'Aéroport, Longueuil, QC J3Y 8Y9", lat: 45.5175, lng: -73.4169, sortOrder: 3 },
  { code: "REM", label: "Station REM (boulevard de Rome)", address: "Boulevard de Rome, Brossard, QC J4X 2A4", lat: 45.4564461, lng: -73.4716479, sortOrder: 4, pointVerified: true },
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
  // 6 octobre 2026 : YUL devient « Arrivées » (le P4 est créé ci-dessus). Une seule fois : tant que
  // YUL garde l'ancien point (le centre de l'aéroport), on le remplace ; ensuite, ce que le Dispatch
  // saisit dans la page Tarifs n'est plus jamais écrasé.
  await prisma.destination.updateMany({
    where: { code: "YUL", lat: ANCIEN_POINT_YUL.lat, lng: ANCIEN_POINT_YUL.lng },
    data: { label: YUL_ARRIVEES.label, address: YUL_ARRIVEES.address, lat: YUL_ARRIVEES.lat, lng: YUL_ARRIVEES.lng, pointVerified: true },
  });
  // Ordre des boutons : YUL Arrivées, YUL P4, YHU, REM (le P4 s'insère en deuxième position).
  await prisma.destination.updateMany({ where: { code: "REM", sortOrder: 3 }, data: { sortOrder: 4 } });
  await prisma.destination.updateMany({ where: { code: "YHU", sortOrder: 2 }, data: { sortOrder: 3 } });
  // Le point du REM a été choisi par le propriétaire le 17 septembre : on le tient pour vérifié.
  await prisma.destination.updateMany({
    where: { code: "REM", lat: 45.4564461, lng: -73.4716479, pointVerified: false },
    data: { pointVerified: true },
  });
}
