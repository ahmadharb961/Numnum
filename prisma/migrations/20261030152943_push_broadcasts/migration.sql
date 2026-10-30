-- CreateTable
CREATE TABLE "push_broadcasts" (
    "id" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "targetLabel" TEXT,
    "title" TEXT,
    "body" TEXT,
    "imageUrl" TEXT,
    "link" TEXT,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "devices" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "push_broadcasts_createdAt_idx" ON "push_broadcasts"("createdAt");

