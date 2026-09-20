-- Niveau de précision du point enregistré pour chaque adresse d'une course.
-- Vide sur les courses existantes : elles continueront d'ouvrir Waze sur le texte de l'adresse,
-- ce qui est le comportement sûr.
ALTER TABLE "Ride" ADD COLUMN "pickupConfidence" TEXT;
ALTER TABLE "Ride" ADD COLUMN "destConfidence" TEXT;
