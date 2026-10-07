-- Audit du 7 octobre 2026 : corrections du serveur.

-- SEC-07 : génération des sessions. Les jetons existants (sans numéro) valent la génération 0 et
-- restent valables ; changer de mot de passe passe à la génération suivante et les révoque tous.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- CONC-02 : une seule note par personne et par course. Des doublons créés par des envois simultanés
-- sont d'abord retirés en gardant la première note donnée (la plus ancienne), puis la base l'impose.
DELETE FROM "Rating" a
USING "Rating" b
WHERE a."rideId" = b."rideId"
  AND a."fromUserId" = b."fromUserId"
  AND (a."createdAt" > b."createdAt" OR (a."createdAt" = b."createdAt" AND a."id" > b."id"));
CREATE UNIQUE INDEX "Rating_rideId_fromUserId_key" ON "Rating"("rideId", "fromUserId");

-- B17 : plus de note fictive de 5/5. Sans aucune note reçue, la moyenne est vide ; les autres
-- moyennes sont recalculées depuis les notes réelles (une suppression de compte effaçait des notes
-- sans recalculer la moyenne des personnes notées).
ALTER TABLE "User" ALTER COLUMN "ratingAvg" DROP DEFAULT;
UPDATE "User" u SET "ratingAvg" = NULL
WHERE NOT EXISTS (SELECT 1 FROM "Rating" r WHERE r."toUserId" = u."id");
UPDATE "User" u SET "ratingAvg" = s.moyenne
FROM (SELECT "toUserId", AVG("stars")::double precision AS moyenne FROM "Rating" GROUP BY "toUserId") s
WHERE u."id" = s."toUserId";
