-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_rideId_fkey";

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "driverId" TEXT,
ALTER COLUMN "rideId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
