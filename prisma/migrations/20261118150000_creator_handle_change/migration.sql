-- Creators can change their username once every 3 months; old usernames redirect for 3 months.
ALTER TABLE "creators" ADD COLUMN "handleChangedAt" TIMESTAMP(3);

CREATE TABLE "creator_handle_aliases" (
    "handle" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_handle_aliases_pkey" PRIMARY KEY ("handle")
);

CREATE INDEX "creator_handle_aliases_creatorId_idx" ON "creator_handle_aliases"("creatorId");

ALTER TABLE "creator_handle_aliases" ADD CONSTRAINT "creator_handle_aliases_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "creators"("id") ON DELETE CASCADE ON UPDATE CASCADE;
