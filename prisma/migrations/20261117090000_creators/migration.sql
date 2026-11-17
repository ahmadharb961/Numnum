-- CreateEnum
CREATE TYPE "CreatorStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CreatorVerification" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'DECLINED');

-- CreateEnum
CREATE TYPE "CreatorTagStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REMOVED', 'EXPIRED');

-- AlterTable
ALTER TABLE "reels" ADD COLUMN     "creatorId" TEXT,
ADD COLUMN     "paidPartnership" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pinnedAt" TIMESTAMP(3),
ADD COLUMN     "tagDecidedAt" TIMESTAMP(3),
ADD COLUMN     "tagNote" TEXT,
ADD COLUMN     "tagRequestedAt" TIMESTAMP(3),
ADD COLUMN     "tagStatus" "CreatorTagStatus";

-- CreateTable
CREATE TABLE "creators" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "instagram" TEXT,
    "tiktok" TEXT,
    "audienceSize" INTEGER,
    "area" TEXT,
    "status" "CreatorStatus" NOT NULL DEFAULT 'PENDING',
    "decisionNote" TEXT,
    "approvedAt" TIMESTAMP(3),
    "verification" "CreatorVerification" NOT NULL DEFAULT 'NONE',
    "verificationNote" TEXT,
    "verificationRequestedAt" TIMESTAMP(3),
    "verificationDecidedAt" TIMESTAMP(3),
    "followerCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_follows" (
    "userId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastNotifiedAt" TIMESTAMP(3),

    CONSTRAINT "creator_follows_pkey" PRIMARY KEY ("userId","creatorId")
);

-- CreateTable
CREATE TABLE "restaurant_creator_blocks" (
    "restaurantId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurant_creator_blocks_pkey" PRIMARY KEY ("restaurantId","creatorId")
);

-- CreateIndex
CREATE UNIQUE INDEX "creators_userId_key" ON "creators"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "creators_handle_key" ON "creators"("handle");

-- CreateIndex
CREATE INDEX "creators_status_createdAt_idx" ON "creators"("status", "createdAt");

-- CreateIndex
CREATE INDEX "creators_verification_idx" ON "creators"("verification");

-- CreateIndex
CREATE INDEX "creator_follows_creatorId_userId_idx" ON "creator_follows"("creatorId", "userId");

-- CreateIndex
CREATE INDEX "reels_creatorId_publishedAt_idx" ON "reels"("creatorId", "publishedAt");

-- CreateIndex
CREATE INDEX "reels_restaurantId_tagStatus_idx" ON "reels"("restaurantId", "tagStatus");

-- AddForeignKey
ALTER TABLE "reels" ADD CONSTRAINT "reels_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "creators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creators" ADD CONSTRAINT "creators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_follows" ADD CONSTRAINT "creator_follows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_follows" ADD CONSTRAINT "creator_follows_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "creators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_creator_blocks" ADD CONSTRAINT "restaurant_creator_blocks_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_creator_blocks" ADD CONSTRAINT "restaurant_creator_blocks_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "creators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

