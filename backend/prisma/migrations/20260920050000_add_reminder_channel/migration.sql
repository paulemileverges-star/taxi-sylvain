-- Canal du rappel déjà envoyé : « push », « courriel » ou « urgence ».
-- Le nouvel index unique est créé AVANT la suppression de l'ancien : la table n'est jamais,
-- même une seconde, sans protection contre les doublons pendant qu'une ancienne instance tourne.
ALTER TABLE "SentReminder" ADD COLUMN "canal" TEXT NOT NULL DEFAULT 'push';
CREATE UNIQUE INDEX "SentReminder_rideId_userId_offsetMinutes_canal_key" ON "SentReminder"("rideId", "userId", "offsetMinutes", "canal");
DROP INDEX IF EXISTS "SentReminder_rideId_userId_offsetMinutes_key";
