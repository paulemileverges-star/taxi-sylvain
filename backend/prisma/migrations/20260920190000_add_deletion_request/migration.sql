-- Demande de suppression de compte validée par le Dispatch (décision du propriétaire du 20 septembre 2026).
-- AlterTable
ALTER TABLE "User" ADD COLUMN "deletionRequestedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "deletionRequestVia" TEXT;
