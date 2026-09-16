-- CreateTable
CREATE TABLE "PriceZone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceYUL" DOUBLE PRECISION,
    "priceYHU" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PriceZone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PriceZone_name_key" ON "PriceZone"("name");
