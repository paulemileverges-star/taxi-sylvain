-- Vague de demandes du 6 octobre 2026 (voir docs/PASSATION.md § 11).

-- Couleur du véhicule, modifiable par le Dispatch avec le reste de la fiche chauffeur.
ALTER TABLE "User" ADD COLUMN "carColor" TEXT;

-- Arrêts entre la prise en charge et la destination, et identifiants Google Maps des adresses.
ALTER TABLE "Ride" ADD COLUMN "stops" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Ride" ADD COLUMN "pickupPlaceId" TEXT;
ALTER TABLE "Ride" ADD COLUMN "destPlaceId" TEXT;

-- Un seul envoi de la notification « récap prêt » par chauffeur et par semaine. Les récaps déjà
-- existants sont considérés comme notifiés : aucun ancien récap ne repartira.
ALTER TABLE "WeeklyReport" ADD COLUMN "notifiedAt" TIMESTAMP(3);
UPDATE "WeeklyReport" SET "notifiedAt" = "createdAt";

-- Points de guidage contrôlés du catalogue (le détail est posé au démarrage par seedDestinations.js).
ALTER TABLE "Destination" ADD COLUMN "pointVerified" BOOLEAN NOT NULL DEFAULT false;
