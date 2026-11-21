-- CreateTable
CREATE TABLE "group_carts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "hostUserId" TEXT,
    "hostDevice" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_cart_members" (
    "id" TEXT NOT NULL,
    "groupCartId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deviceKey" TEXT NOT NULL,
    "userId" TEXT,
    "isHost" BOOLEAN NOT NULL DEFAULT false,
    "lines" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_cart_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_carts_code_key" ON "group_carts"("code");

-- CreateIndex
CREATE INDEX "group_carts_expiresAt_idx" ON "group_carts"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "group_cart_members_groupCartId_deviceKey_key" ON "group_cart_members"("groupCartId", "deviceKey");

-- AddForeignKey
ALTER TABLE "group_carts" ADD CONSTRAINT "group_carts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_cart_members" ADD CONSTRAINT "group_cart_members_groupCartId_fkey" FOREIGN KEY ("groupCartId") REFERENCES "group_carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

