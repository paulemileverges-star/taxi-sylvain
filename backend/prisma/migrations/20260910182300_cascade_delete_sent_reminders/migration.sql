-- DropForeignKey
ALTER TABLE "SentReminder" DROP CONSTRAINT "SentReminder_userId_fkey";

-- AddForeignKey
ALTER TABLE "SentReminder" ADD CONSTRAINT "SentReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
