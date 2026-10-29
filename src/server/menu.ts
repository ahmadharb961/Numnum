import "server-only";
import { prisma } from "./db";
import { audit } from "./audit";
import { autoMapColumns, parseCsv, validateRows, type ColumnMapping, type ImportRow } from "@/lib/csv-import";
import { matchImagesToSkus } from "@/lib/image-match";

export async function validateImport(restaurantId: string, text: string, mapping?: ColumnMapping) {
  const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { currency: true } });
  const parsed = parseCsv(text);
  const map = mapping && Object.keys(mapping).length ? mapping : autoMapColumns(parsed.headers);
  const existing = await prisma.menuItem.findMany({ where: { restaurantId }, select: { sku: true } });
  const existingSkus = new Set(existing.map((e) => e.sku.toLowerCase()));
  const { rows, fileErrors } = validateRows(parsed, map, { restaurantCurrency: restaurant.currency, existingSkus });
  const presentSkus = new Set(rows.map((r) => r.sku.toLowerCase()).filter(Boolean));
  const missing = await prisma.menuItem.findMany({ where: { restaurantId, archived: false }, select: { id: true, sku: true, name: true } });
  return {
    headers: parsed.headers,
    mapping: map,
    rows,
    fileErrors,
    missingFromFile: missing.filter((m) => !presentSkus.has(m.sku.toLowerCase())),
    stats: {
      total: rows.length,
      valid: rows.filter((r) => !r.errors.length).length,
      invalid: rows.filter((r) => r.errors.length).length,
      warnings: rows.filter((r) => r.warnings.length).length,
      creates: rows.filter((r) => !r.errors.length && r.action === "create").length,
      updates: rows.filter((r) => !r.errors.length && r.action === "update").length,
    },
  };
}

/**
 * Applies valid rows. Existing SKUs are updated in place: photos, reels,
 * reviews, order history and customization links are preserved. Items absent
 * from the file are NEVER deleted here (see archiveItems for the explicit flow).
 */
export async function commitImport(restaurantId: string, userId: string, fileName: string, text: string, mapping: ColumnMapping) {
  const v = await validateImport(restaurantId, text, mapping);
  if (v.fileErrors.length) throw new Error(v.fileErrors[0]);
  const valid = v.rows.filter((r) => !r.errors.length);
  if (!valid.length) throw new Error("There are no valid rows to import");
  const foodCats = await prisma.foodCategory.findMany({ where: { active: true } });
  const matchFood = (cat: string) => {
    const c = cat.toLowerCase();
    return foodCats.find((f) => f.name.toLowerCase() === c || f.slug === c || c.includes(f.name.toLowerCase().replace(/s$/, "")))?.id ?? null;
  };

  let created = 0, updated = 0;
  await prisma.$transaction(
    async (tx) => {
      const cats = new Map<string, string>();
      const existingCats = await tx.menuCategory.findMany({ where: { restaurantId } });
      for (const c of existingCats) cats.set(c.name.toLowerCase(), c.id);
      let order = existingCats.length;
      for (const r of valid) {
        const key = r.category.toLowerCase();
        if (!cats.has(key)) {
          const c = await tx.menuCategory.create({ data: { restaurantId, name: r.category, sortOrder: order++ } });
          cats.set(key, c.id);
        }
      }
      const existingItems = await tx.menuItem.findMany({ where: { restaurantId }, select: { id: true, sku: true, foodCategoryId: true } });
      const bySku = new Map(existingItems.map((i) => [i.sku.toLowerCase(), i]));
      let sort = existingItems.length;
      for (const r of valid) {
        const data = {
          name: r.name,
          description: r.description,
          ingredients: r.ingredients,
          priceCents: r.priceCents!,
          currency: r.currency,
          available: r.available,
          allergens: r.allergens,
          dietaryLabels: r.dietaryLabels,
          prepTimeMinutes: r.prepTimeMinutes,
          menuCategoryId: cats.get(r.category.toLowerCase())!,
          archived: false,
        };
        const ex = bySku.get(r.sku.toLowerCase());
        if (ex) {
          await tx.menuItem.update({ where: { id: ex.id }, data: { ...data, foodCategoryId: ex.foodCategoryId ?? matchFood(r.category) } });
          updated++;
        } else {
          await tx.menuItem.create({ data: { ...data, restaurantId, sku: r.sku, foodCategoryId: matchFood(r.category), sortOrder: sort++ } });
          created++;
        }
      }
      const imageMap: Record<string, string> = {};
      for (const r of valid) if (r.image) imageMap[r.image.toLowerCase()] = r.sku;
      await tx.menuImport.create({
        data: { restaurantId, fileName: fileName.slice(0, 200), status: "COMPLETED", rowCount: v.rows.length, created, updated, skipped: v.rows.length - valid.length, createdById: userId, report: { imageMap, errors: v.rows.filter((r) => r.errors.length).map((r: ImportRow) => ({ row: r.row, sku: r.sku, errors: r.errors })) } },
      });
    },
    { timeout: 60_000 },
  );
  await audit({ actorId: userId, action: "menu.import", entityType: "restaurant", entityId: restaurantId, data: { fileName, created, updated, skipped: v.rows.length - valid.length } });
  return { created, updated, skipped: v.rows.length - valid.length, missingFromFile: v.missingFromFile };
}

/** Explicit, confirmed archival of items (e.g. those missing from a re-import). History is preserved. */
export async function archiveItems(restaurantId: string, userId: string, ids: string[]) {
  const res = await prisma.menuItem.updateMany({ where: { id: { in: ids }, restaurantId }, data: { archived: true, available: false } });
  await prisma.reel.updateMany({ where: { menuItemId: { in: ids }, restaurantId, visibility: "PUBLISHED" }, data: { visibility: "UNPUBLISHED" } });
  await audit({ actorId: userId, action: "menu.archive", entityType: "restaurant", entityId: restaurantId, data: { ids } });
  return res.count;
}

/** Match filenames using the latest CSV image column, then SKU naming conventions. */
export async function matchFilenames(restaurantId: string, files: string[]) {
  const items = await prisma.menuItem.findMany({ where: { restaurantId, archived: false }, select: { id: true, sku: true, name: true, _count: { select: { images: true } } } });
  const lastImport = await prisma.menuImport.findFirst({ where: { restaurantId, status: "COMPLETED" }, orderBy: { createdAt: "desc" } });
  const imageMap = ((lastImport?.report as { imageMap?: Record<string, string> } | null)?.imageMap ?? {}) as Record<string, string>;
  const bySku = new Map(items.map((i) => [i.sku.toLowerCase(), i]));
  const results = matchImagesToSkus(files, items.map((i) => i.sku));
  const used = new Set(results.filter((r) => r.status === "matched").map((r) => `${r.sku!.toLowerCase()}#${r.index}`));
  for (const r of results) {
    if (r.status !== "unmatched") continue;
    const sku = imageMap[(r.file.split(/[\\/]/).pop() || r.file).toLowerCase()];
    if (sku && bySku.has(sku.toLowerCase())) {
      const key = `${sku.toLowerCase()}#1`;
      r.status = used.has(key) ? "duplicate" : "matched";
      r.sku = bySku.get(sku.toLowerCase())!.sku;
      r.index = 1;
      used.add(key);
    }
  }
  const matchedSkus = new Set(results.filter((r) => r.status === "matched").map((r) => r.sku!.toLowerCase()));
  return {
    results: results.map((r) => ({ ...r, menuItemId: r.sku ? bySku.get(r.sku.toLowerCase())?.id : undefined, itemName: r.sku ? bySku.get(r.sku.toLowerCase())?.name : undefined })),
    stillMissing: items.filter((i) => i._count.images === 0 && !matchedSkus.has(i.sku.toLowerCase())).map((i) => ({ id: i.id, sku: i.sku, name: i.name })),
  };
}

export async function attachImage(restaurantId: string, menuItemId: string, assetId: string, opts: { index?: number; makeMain?: boolean } = {}) {
  const item = await prisma.menuItem.findFirst({ where: { id: menuItemId, restaurantId }, include: { images: true } });
  const asset = await prisma.mediaAsset.findFirst({ where: { id: assetId, restaurantId, kind: "IMAGE" } });
  if (!item || !asset) throw new Error("Not found");
  const existing = item.images.find((i) => i.assetId === assetId);
  if (existing) return existing;
  const isMain = opts.makeMain || item.images.length === 0 || opts.index === 1;
  return prisma.$transaction(async (tx) => {
    if (isMain) await tx.menuItemImage.updateMany({ where: { menuItemId }, data: { isMain: false } });
    return tx.menuItemImage.create({ data: { menuItemId, assetId, isMain, sortOrder: opts.index ? opts.index - 1 : item.images.length } });
  });
}

export async function getMainImages(itemIds: string[]) {
  const imgs = await prisma.menuItemImage.findMany({ where: { menuItemId: { in: itemIds } }, include: { asset: { select: { url: true, thumbUrl: true } } }, orderBy: [{ isMain: "desc" }, { sortOrder: "asc" }] });
  const map = new Map<string, { url: string; thumbUrl: string | null }>();
  for (const i of imgs) if (!map.has(i.menuItemId)) map.set(i.menuItemId, i.asset);
  return map;
}
