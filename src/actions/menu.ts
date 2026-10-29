"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireRestaurant } from "@/server/auth";
import { archiveItems, commitImport, validateImport, matchFilenames } from "@/server/menu";
import { audit } from "@/server/audit";
import { parseAmount } from "@/lib/money";
import type { ColumnMapping } from "@/lib/csv-import";
import type { FormState } from "./auth";

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: (e as Error).message || "Something went wrong" };
}

// ───── Items ─────

const itemSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  sku: z.string().trim().min(1, "SKU is required").max(64).regex(/^[\p{L}\p{N}._\-]+$/u, "Letters, numbers, dot, dash, underscore only"),
  description: z.string().trim().max(1000).optional(),
  ingredients: z.string().trim().max(1000).optional(),
  allergens: z.string().trim().max(300).optional(),
  dietaryLabels: z.string().trim().max(200).optional(),
  price: z.string().trim().min(1, "Price is required"),
  menuCategoryId: z.string().optional(),
  newCategory: z.string().trim().max(60).optional(),
  foodCategoryId: z.string().optional(),
  prepTimeMinutes: z.string().optional(),
});

export async function saveItemAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireRestaurant("MANAGER");
  const r = ctx.restaurant;
  const parsed = itemSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) };
  const d = parsed.data;
  const priceCents = parseAmount(d.price, r.currency);
  if (priceCents === null || priceCents < 0) return { fieldErrors: { price: "Enter a valid price" } };
  const id = String(form.get("id") || "") || null;

  const dup = await prisma.menuItem.findFirst({ where: { restaurantId: r.id, sku: { equals: d.sku, mode: "insensitive" }, NOT: id ? { id } : undefined } });
  if (dup) return { fieldErrors: { sku: `SKU already used by “${dup.name}”` } };

  let menuCategoryId = d.menuCategoryId || null;
  if (d.newCategory) {
    const c = await prisma.menuCategory.upsert({ where: { restaurantId_name: { restaurantId: r.id, name: d.newCategory } }, create: { restaurantId: r.id, name: d.newCategory, sortOrder: 999 }, update: {} });
    menuCategoryId = c.id;
  }
  if (menuCategoryId && !(await prisma.menuCategory.findFirst({ where: { id: menuCategoryId, restaurantId: r.id } }))) menuCategoryId = null;
  const prep = d.prepTimeMinutes ? Number(d.prepTimeMinutes) : null;
  const groupIds = form.getAll("groupIds").map(String);
  const validGroups = await prisma.customizationGroup.findMany({ where: { id: { in: groupIds }, restaurantId: r.id }, select: { id: true } });

  const data = {
    name: d.name,
    sku: d.sku,
    description: d.description || null,
    ingredients: d.ingredients || null,
    allergens: d.allergens || null,
    dietaryLabels: (d.dietaryLabels || "").split(",").map((s) => s.trim()).filter(Boolean),
    priceCents,
    currency: r.currency,
    menuCategoryId,
    foodCategoryId: d.foodCategoryId || null,
    prepTimeMinutes: prep && Number.isInteger(prep) && prep > 0 && prep < 600 ? prep : null,
    available: form.get("available") === "on",
  };
  const item = await prisma.$transaction(async (tx) => {
    const saved = id
      ? await tx.menuItem.update({ where: { id, restaurantId: r.id }, data })
      : await tx.menuItem.create({ data: { ...data, restaurantId: r.id } });
    await tx.menuItemCustomizationGroup.deleteMany({ where: { menuItemId: saved.id, groupId: { notIn: validGroups.map((g) => g.id) } } });
    for (const [i, gid] of groupIds.entries()) {
      if (!validGroups.some((g) => g.id === gid)) continue;
      await tx.menuItemCustomizationGroup.upsert({ where: { menuItemId_groupId: { menuItemId: saved.id, groupId: gid } }, create: { menuItemId: saved.id, groupId: gid, sortOrder: i }, update: { sortOrder: i } });
    }
    return saved;
  });
  revalidatePath("/dashboard/menu");
  revalidatePath(`/r/${r.slug}`);
  if (!id) redirect(`/dashboard/menu/items/${item.id}?created=1`);
  return { ok: true, message: "Saved" };
}

export async function toggleAvailabilityAction(itemId: string, available: boolean): Promise<ActionResult> {
  const ctx = await requireRestaurant("STAFF");
  await prisma.menuItem.update({ where: { id: itemId, restaurantId: ctx.restaurant.id }, data: { available } });
  revalidatePath("/dashboard/menu");
  return { ok: true };
}

export async function archiveItemsAction(ids: string[]): Promise<ActionResult<number>> {
  const ctx = await requireRestaurant("MANAGER");
  const n = await archiveItems(ctx.restaurant.id, ctx.user.id, ids);
  revalidatePath("/dashboard/menu");
  return { ok: true, data: n, message: `${n} item(s) archived` };
}

export async function restoreItemAction(id: string): Promise<ActionResult> {
  const ctx = await requireRestaurant("MANAGER");
  await prisma.menuItem.update({ where: { id, restaurantId: ctx.restaurant.id }, data: { archived: false } });
  revalidatePath("/dashboard/menu");
  return { ok: true };
}

// ───── Categories ─────

export async function saveCategoryAction(id: string | null, name: string): Promise<ActionResult> {
  const ctx = await requireRestaurant("MANAGER");
  const n = name.trim();
  if (!n || n.length > 60) return { ok: false, error: "Enter a category name (max 60)" };
  try {
    if (id) await prisma.menuCategory.update({ where: { id, restaurantId: ctx.restaurant.id }, data: { name: n } });
    else await prisma.menuCategory.create({ data: { restaurantId: ctx.restaurant.id, name: n, sortOrder: await prisma.menuCategory.count({ where: { restaurantId: ctx.restaurant.id } }) } });
  } catch {
    return { ok: false, error: "A category with this name already exists" };
  }
  revalidatePath("/dashboard/menu");
  return { ok: true };
}

export async function moveCategoryAction(id: string, dir: -1 | 1): Promise<ActionResult> {
  const ctx = await requireRestaurant("MANAGER");
  const cats = await prisma.menuCategory.findMany({ where: { restaurantId: ctx.restaurant.id }, orderBy: { sortOrder: "asc" } });
  const i = cats.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= cats.length) return { ok: true };
  [cats[i], cats[j]] = [cats[j], cats[i]];
  await prisma.$transaction(cats.map((c, idx) => prisma.menuCategory.update({ where: { id: c.id }, data: { sortOrder: idx } })));
  revalidatePath("/dashboard/menu");
  return { ok: true };
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  const ctx = await requireRestaurant("MANAGER");
  await prisma.menuCategory.delete({ where: { id, restaurantId: ctx.restaurant.id } }); // items keep existing with no category
  revalidatePath("/dashboard/menu");
  return { ok: true };
}

// ───── Customization groups ─────

const optionSchema = z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(80), price: z.string().default("0"), available: z.boolean().default(true), isDefault: z.boolean().default(false) });
const groupSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Group name is required").max(80),
  type: z.enum(["SINGLE", "MULTIPLE", "TEXT"]),
  required: z.boolean(),
  minSelect: z.number().int().min(0).max(50),
  maxSelect: z.number().int().min(0).max(50),
  options: z.array(optionSchema).max(60),
});

export async function saveGroupAction(input: z.infer<typeof groupSchema>): Promise<ActionResult<string>> {
  const ctx = await requireRestaurant("MANAGER");
  const r = ctx.restaurant;
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const g = parsed.data;
  if (g.type !== "TEXT" && g.options.length === 0) return { ok: false, error: "Add at least one option" };
  if (g.type === "MULTIPLE" && g.maxSelect && g.minSelect > g.maxSelect) return { ok: false, error: "Minimum can't be greater than maximum" };
  const options: (z.infer<typeof optionSchema> & { priceDeltaCents: number })[] = [];
  for (const o of g.options) {
    const cents = parseAmount(o.price || "0", r.currency);
    if (cents === null) return { ok: false, error: `Invalid price for “${o.name}”` };
    options.push({ ...o, priceDeltaCents: cents });
  }
  try {
    const id = await prisma.$transaction(async (tx) => {
      const base = { name: g.name, type: g.type, required: g.required, minSelect: g.type === "SINGLE" ? (g.required ? 1 : 0) : g.minSelect, maxSelect: g.type === "SINGLE" ? 1 : g.maxSelect };
      const group = g.id ? await tx.customizationGroup.update({ where: { id: g.id, restaurantId: r.id }, data: base }) : await tx.customizationGroup.create({ data: { ...base, restaurantId: r.id } });
      const keep = options.filter((o) => o.id).map((o) => o.id!);
      await tx.customizationOption.deleteMany({ where: { groupId: group.id, id: { notIn: keep } } });
      for (const [i, o] of (g.type === "TEXT" ? [] : options).entries()) {
        const data = { name: o.name, priceDeltaCents: o.priceDeltaCents, available: o.available, isDefault: o.isDefault, sortOrder: i };
        if (o.id) await tx.customizationOption.update({ where: { id: o.id, groupId: group.id }, data });
        else await tx.customizationOption.create({ data: { ...data, groupId: group.id } });
      }
      return group.id;
    });
    revalidatePath("/dashboard/customizations");
    return { ok: true, data: id, message: "Customization saved" };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteGroupAction(id: string): Promise<ActionResult> {
  const ctx = await requireRestaurant("MANAGER");
  await prisma.customizationGroup.delete({ where: { id, restaurantId: ctx.restaurant.id } });
  revalidatePath("/dashboard/customizations");
  return { ok: true };
}

// ───── CSV import ─────

export async function validateCsvAction(text: string, mapping?: ColumnMapping) {
  const ctx = await requireRestaurant("MANAGER");
  try {
    return { ok: true as const, data: await validateImport(ctx.restaurant.id, text, mapping) };
  } catch (e) {
    return fail(e);
  }
}

export async function commitCsvAction(fileName: string, text: string, mapping: ColumnMapping) {
  const ctx = await requireRestaurant("MANAGER");
  try {
    const res = await commitImport(ctx.restaurant.id, ctx.user.id, fileName, text, mapping);
    revalidatePath("/dashboard/menu");
    revalidatePath(`/r/${ctx.restaurant.slug}`);
    return { ok: true as const, data: res };
  } catch (e) {
    return fail(e);
  }
}

// ───── Photos ─────

export async function matchImagesAction(files: string[]) {
  const ctx = await requireRestaurant("MANAGER");
  return matchFilenames(ctx.restaurant.id, files.slice(0, 1000));
}

export async function assignPhotoAction(menuItemId: string, assetId: string, makeMain = false): Promise<ActionResult> {
  const ctx = await requireRestaurant("MANAGER");
  try {
    const { attachImage } = await import("@/server/menu");
    await attachImage(ctx.restaurant.id, menuItemId, assetId, { makeMain });
    revalidatePath("/dashboard/menu/photos");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setMainPhotoAction(imageId: string): Promise<ActionResult> {
  const ctx = await requireRestaurant("MANAGER");
  const img = await prisma.menuItemImage.findFirst({ where: { id: imageId, menuItem: { restaurantId: ctx.restaurant.id } } });
  if (!img) return { ok: false, error: "Not found" };
  await prisma.$transaction([prisma.menuItemImage.updateMany({ where: { menuItemId: img.menuItemId }, data: { isMain: false } }), prisma.menuItemImage.update({ where: { id: imageId }, data: { isMain: true } })]);
  revalidatePath(`/dashboard/menu/items/${img.menuItemId}`);
  return { ok: true };
}

export async function movePhotoAction(imageId: string, dir: -1 | 1): Promise<ActionResult> {
  const ctx = await requireRestaurant("MANAGER");
  const img = await prisma.menuItemImage.findFirst({ where: { id: imageId, menuItem: { restaurantId: ctx.restaurant.id } } });
  if (!img) return { ok: false, error: "Not found" };
  const all = await prisma.menuItemImage.findMany({ where: { menuItemId: img.menuItemId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const i = all.findIndex((x) => x.id === imageId);
  const j = i + dir;
  if (j < 0 || j >= all.length) return { ok: true };
  [all[i], all[j]] = [all[j], all[i]];
  await prisma.$transaction(all.map((x, idx) => prisma.menuItemImage.update({ where: { id: x.id }, data: { sortOrder: idx } })));
  revalidatePath(`/dashboard/menu/items/${img.menuItemId}`);
  return { ok: true };
}

export async function removePhotoAction(imageId: string): Promise<ActionResult> {
  const ctx = await requireRestaurant("MANAGER");
  const img = await prisma.menuItemImage.findFirst({ where: { id: imageId, menuItem: { restaurantId: ctx.restaurant.id } } });
  if (!img) return { ok: false, error: "Not found" };
  await prisma.menuItemImage.delete({ where: { id: imageId } });
  if (img.isMain) {
    const next = await prisma.menuItemImage.findFirst({ where: { menuItemId: img.menuItemId }, orderBy: { sortOrder: "asc" } });
    if (next) await prisma.menuItemImage.update({ where: { id: next.id }, data: { isMain: true } });
  }
  revalidatePath(`/dashboard/menu/items/${img.menuItemId}`);
  revalidatePath("/dashboard/menu/photos");
  return { ok: true };
}

export async function deleteLibraryPhotoAction(assetId: string): Promise<ActionResult> {
  const ctx = await requireRestaurant("MANAGER");
  const inUse = await prisma.menuItemImage.count({ where: { assetId } });
  if (inUse) return { ok: false, error: "Remove this photo from its menu items first" };
  await prisma.mediaAsset.delete({ where: { id: assetId, restaurantId: ctx.restaurant.id, kind: "IMAGE" } });
  await audit({ actorId: ctx.user.id, action: "media.delete", entityType: "media_asset", entityId: assetId });
  revalidatePath("/dashboard/menu/photos");
  return { ok: true };
}
