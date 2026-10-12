-- CreateEnum
CREATE TYPE "DropStatus" AS ENUM ('UPCOMING', 'LIVE', 'SOLD_OUT', 'CLOSED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'EXPIRED', 'RELEASED');

-- CreateTable
CREATE TABLE "GroupBuyDrop" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "openAt" TIMESTAMP(3) NOT NULL,
    "closeAt" TIMESTAMP(3) NOT NULL,
    "totalStock" INTEGER NOT NULL,
    "soldCount" INTEGER NOT NULL DEFAULT 0,
    "isManuallyClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupBuyDrop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DropReservation" (
    "id" TEXT NOT NULL,
    "dropId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cartItemId" TEXT,
    "quantity" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DropReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupBuyDrop_slug_key" ON "GroupBuyDrop"("slug");

-- CreateIndex
CREATE INDEX "GroupBuyDrop_slug_idx" ON "GroupBuyDrop"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "DropReservation_cartItemId_key" ON "DropReservation"("cartItemId");

-- CreateIndex
CREATE INDEX "DropReservation_dropId_status_idx" ON "DropReservation"("dropId", "status");

-- CreateIndex
CREATE INDEX "DropReservation_userId_idx" ON "DropReservation"("userId");

-- AddForeignKey
ALTER TABLE "GroupBuyDrop" ADD CONSTRAINT "GroupBuyDrop_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupBuyDrop" ADD CONSTRAINT "GroupBuyDrop_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DropReservation" ADD CONSTRAINT "DropReservation_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "GroupBuyDrop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DropReservation" ADD CONSTRAINT "DropReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DropReservation" ADD CONSTRAINT "DropReservation_cartItemId_fkey" FOREIGN KEY ("cartItemId") REFERENCES "CartItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
