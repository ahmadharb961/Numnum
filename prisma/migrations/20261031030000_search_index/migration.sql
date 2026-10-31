-- Trigram matching for search (substring and typo-tolerant lookups that use an index).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "searchName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "searchText" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "searchedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "searchName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "searchText" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "searchedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "menu_items_search_text_trgm" ON "menu_items" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "menu_items_search_name_trgm" ON "menu_items" USING GIN ("searchName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "menu_items_searchedAt_idx" ON "menu_items"("searchedAt");

-- CreateIndex
CREATE INDEX "restaurants_search_text_trgm" ON "restaurants" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "restaurants_search_name_trgm" ON "restaurants" USING GIN ("searchName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "restaurants_searchedAt_idx" ON "restaurants"("searchedAt");


-- Rows whose search text is out of date get "searchedAt" = NULL; src/server/search-text.ts
-- rebuilds them. These triggers catch every way the source text can change.
CREATE OR REPLACE FUNCTION nn_menu_item_search_stale() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT'
    OR NEW."name" IS DISTINCT FROM OLD."name"
    OR NEW."description" IS DISTINCT FROM OLD."description"
    OR NEW."ingredients" IS DISTINCT FROM OLD."ingredients"
    OR NEW."dietaryLabels" IS DISTINCT FROM OLD."dietaryLabels"
    OR NEW."foodCategoryId" IS DISTINCT FROM OLD."foodCategoryId"
    OR NEW."menuCategoryId" IS DISTINCT FROM OLD."menuCategoryId"
    OR NEW."archived" IS DISTINCT FROM OLD."archived" THEN
    NEW."searchedAt" := NULL;
    UPDATE "restaurants" SET "searchedAt" = NULL WHERE "id" = NEW."restaurantId" AND "searchedAt" IS NOT NULL;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "menu_items_search_stale" BEFORE INSERT OR UPDATE ON "menu_items" FOR EACH ROW EXECUTE FUNCTION nn_menu_item_search_stale();

CREATE OR REPLACE FUNCTION nn_menu_item_search_deleted() RETURNS trigger AS $$
BEGIN
  UPDATE "restaurants" SET "searchedAt" = NULL WHERE "id" = OLD."restaurantId" AND "searchedAt" IS NOT NULL;
  RETURN OLD;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "menu_items_search_deleted" AFTER DELETE ON "menu_items" FOR EACH ROW EXECUTE FUNCTION nn_menu_item_search_deleted();

CREATE OR REPLACE FUNCTION nn_restaurant_search_stale() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT'
    OR NEW."displayName" IS DISTINCT FROM OLD."displayName"
    OR NEW."cuisine" IS DISTINCT FROM OLD."cuisine"
    OR NEW."area" IS DISTINCT FROM OLD."area"
    OR NEW."city" IS DISTINCT FROM OLD."city"
    OR NEW."description" IS DISTINCT FROM OLD."description" THEN
    NEW."searchedAt" := NULL;
    IF TG_OP = 'UPDATE' THEN
      UPDATE "menu_items" SET "searchedAt" = NULL WHERE "restaurantId" = NEW."id" AND "searchedAt" IS NOT NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "restaurants_search_stale" BEFORE INSERT OR UPDATE ON "restaurants" FOR EACH ROW EXECUTE FUNCTION nn_restaurant_search_stale();

CREATE OR REPLACE FUNCTION nn_food_category_search_stale() RETURNS trigger AS $$
BEGIN
  IF NEW."name" IS DISTINCT FROM OLD."name" OR NEW."nameAr" IS DISTINCT FROM OLD."nameAr" THEN
    UPDATE "menu_items" SET "searchedAt" = NULL WHERE "foodCategoryId" = NEW."id";
    UPDATE "restaurants" SET "searchedAt" = NULL WHERE "id" IN (SELECT "restaurantId" FROM "menu_items" WHERE "foodCategoryId" = NEW."id");
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "food_categories_search_stale" AFTER UPDATE ON "food_categories" FOR EACH ROW EXECUTE FUNCTION nn_food_category_search_stale();

CREATE OR REPLACE FUNCTION nn_menu_category_search_stale() RETURNS trigger AS $$
BEGIN
  IF NEW."name" IS DISTINCT FROM OLD."name" THEN
    UPDATE "menu_items" SET "searchedAt" = NULL WHERE "menuCategoryId" = NEW."id";
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "menu_categories_search_stale" AFTER UPDATE ON "menu_categories" FOR EACH ROW EXECUTE FUNCTION nn_menu_category_search_stale();
