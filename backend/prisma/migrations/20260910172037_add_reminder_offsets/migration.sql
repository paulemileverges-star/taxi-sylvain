-- AlterTable
ALTER TABLE "User" ADD COLUMN     "reminderOffsets" INTEGER[] DEFAULT ARRAY[60, 10]::INTEGER[];

-- CreateTable
CREATE TABLE "SentReminder" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "offsetMinutes" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SentReminder_rideId_userId_offsetMinutes_key" ON "SentReminder"("rideId", "userId", "offsetMinutes");

-- AddForeignKey
ALTER TABLE "SentReminder" ADD CONSTRAINT "SentReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
