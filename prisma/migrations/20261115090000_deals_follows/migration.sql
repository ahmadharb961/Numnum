-- CreateEnum
CREATE TYPE "DealKind" AS ENUM ('PERCENT_OFF', 'AMOUNT_OFF', 'FREE_DELIVERY');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "dealSummary" TEXT,
ADD COLUMN     "deliveryFeeWaivedCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discountCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "followerCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "kind" "DealKind" NOT NULL,
    "percent" INTEGER,
    "amountCents" INTEGER,
    "minSubtotalCents" INTEGER,
    "menuItemId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_follows" (
    "userId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastNotifiedAt" TIMESTAMP(3),

    CONSTRAINT "restaurant_follows_pkey" PRIMARY KEY ("userId","restaurantId")
);

-- CreateIndex
CREATE INDEX "deals_restaurantId_endedAt_idx" ON "deals"("restaurantId", "endedAt");

-- CreateIndex
CREATE INDEX "restaurant_follows_restaurantId_idx" ON "restaurant_follows"("restaurantId");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_follows" ADD CONSTRAINT "restaurant_follows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_follows" ADD CONSTRAINT "restaurant_follows_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

