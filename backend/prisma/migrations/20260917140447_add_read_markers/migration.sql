-- CreateTable
CREATE TABLE "ReadMarker" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadMarker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReadMarker_userId_threadKey_key" ON "ReadMarker"("userId", "threadKey");

-- AddForeignKey
ALTER TABLE "ReadMarker" ADD CONSTRAINT "ReadMarker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
