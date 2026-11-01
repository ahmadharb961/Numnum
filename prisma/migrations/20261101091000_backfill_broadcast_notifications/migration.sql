-- Earlier admin broadcasts to restaurants were only pushed; copy them into each restaurant's
-- dashboard notifications (with the photo) so they can be opened there.
INSERT INTO "notifications" ("id", "restaurantId", "audience", "type", "title", "body", "imageUrl", "link", "createdAt")
SELECT 'bc_' || md5(b."id" || r."id"), r."id", 'RESTAURANT', 'BROADCAST', COALESCE(b."title", 'numnum'), b."body", b."imageUrl", '/m/' || b."id", b."createdAt"
FROM "push_broadcasts" b
JOIN "restaurants" r
  ON (b."audience" IN ('restaurants', 'everyone') AND EXISTS (SELECT 1 FROM "restaurant_staff" s WHERE s."restaurantId" = r."id"))
  OR (b."audience" = 'restaurant' AND r."displayName" = b."targetLabel")
WHERE NOT EXISTS (SELECT 1 FROM "notifications" n WHERE n."restaurantId" = r."id" AND n."link" = '/m/' || b."id");
