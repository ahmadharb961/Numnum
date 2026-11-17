-- Food creators in search: normalized name and text (filled by the app; see refreshCreatorSearch).
ALTER TABLE "creators" ADD COLUMN "searchName" TEXT NOT NULL DEFAULT '',
ADD COLUMN "searchText" TEXT NOT NULL DEFAULT '';
