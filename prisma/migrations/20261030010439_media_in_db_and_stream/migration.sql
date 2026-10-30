-- CreateTable
CREATE TABLE "media_blobs" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "media_blobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_blobs_assetId_variant_key" ON "media_blobs"("assetId", "variant");

-- AddForeignKey
ALTER TABLE "media_blobs" ADD CONSTRAINT "media_blobs_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
