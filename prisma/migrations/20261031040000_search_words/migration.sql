-- Dictionary of every word in the search text, for spelling correction ("shawrma" -> "shawarma").
-- Refreshed by src/server/search-text.ts after the search text changes.
CREATE MATERIALIZED VIEW "search_words" AS
  SELECT w AS "word", count(*)::int AS "n"
  FROM (
    SELECT unnest(string_to_array("searchText", ' ')) AS w FROM "menu_items" WHERE "archived" = false
    UNION ALL
    SELECT unnest(string_to_array("searchText", ' ')) AS w FROM "restaurants" WHERE "status" = 'ACTIVE'
  ) t
  WHERE length(w) >= 3
  GROUP BY w;

CREATE UNIQUE INDEX "search_words_word_key" ON "search_words" ("word");
CREATE INDEX "search_words_word_trgm" ON "search_words" USING GIN ("word" gin_trgm_ops);
