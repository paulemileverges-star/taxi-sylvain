-- Prix négocié avec un client pour chaque destination. Vide = la grille des municipalités décide,
-- exactement comme avant. Trois colonnes facultatives : aucune donnée existante n'est touchée.
ALTER TABLE "User" ADD COLUMN "priceYUL" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN "priceYHU" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN "priceREM" DOUBLE PRECISION;
