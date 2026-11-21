-- CreateTable
CREATE TABLE "app_devices" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "userId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_devices_platform_lastSeenAt_idx" ON "app_devices"("platform", "lastSeenAt");

-- CreateIndex
CREATE INDEX "app_devices_userId_idx" ON "app_devices"("userId");

-- AddForeignKey
ALTER TABLE "app_devices" ADD CONSTRAINT "app_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

