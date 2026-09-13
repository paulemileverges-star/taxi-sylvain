-- AlterTable
ALTER TABLE "Ride" ADD COLUMN     "refusedBy" TEXT[] DEFAULT ARRAY[]::TEXT[];
