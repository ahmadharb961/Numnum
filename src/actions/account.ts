"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth";
import { normalizeMapsUrl } from "@/server/orders";
import type { ActionResult } from "./menu";
import { isValidLatLng } from "@/lib/geo";

const addressSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1, "Give it a name, e.g. Home").max(40),
  area: z.string().trim().max(80).optional(),
  address: z.string().trim().min(4, "Enter the street address").max(300),
  building: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(300).optional(),
  mapsUrl: z.string().trim().max(500).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  isDefault: z.boolean().optional(),
});

export async function saveAddressAction(input: z.infer<typeof addressSchema>): Promise<ActionResult> {
  const user = await requireUser("/account/addresses");
  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const a = parsed.data;
  // Delivery fees and range are calculated from the pin, so every saved address needs one.
  if (!isValidLatLng(a.latitude, a.longitude)) return { ok: false, error: "Pin the exact location on the map" };
  const mapsUrl = normalizeMapsUrl(null, a.latitude, a.longitude);
  const data = { label: a.label, area: a.area || null, address: a.address, building: a.building || null, notes: a.notes || null, mapsUrl, latitude: a.latitude ?? null, longitude: a.longitude ?? null };
  await prisma.$transaction(async (tx) => {
    const count = await tx.customerAddress.count({ where: { userId: user.id } });
    if (!a.id && count >= 20) throw new Error("You can save up to 20 addresses");
    const makeDefault = a.isDefault || count === 0;
    if (makeDefault) await tx.customerAddress.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
    if (a.id) await tx.customerAddress.update({ where: { id: a.id, userId: user.id }, data: { ...data, ...(makeDefault ? { isDefault: true } : {}) } });
    else await tx.customerAddress.create({ data: { ...data, userId: user.id, isDefault: makeDefault } });
  });
  revalidatePath("/account/addresses");
  return { ok: true, message: "Address saved" };
}

export async function deleteAddressAction(id: string): Promise<ActionResult> {
  const user = await requireUser("/account/addresses");
  const a = await prisma.customerAddress.findFirst({ where: { id, userId: user.id } });
  if (!a) return { ok: false, error: "Not found" };
  await prisma.customerAddress.delete({ where: { id } });
  if (a.isDefault) {
    const next = await prisma.customerAddress.findFirst({ where: { userId: user.id }, orderBy: { updatedAt: "desc" } });
    if (next) await prisma.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  revalidatePath("/account/addresses");
  return { ok: true, message: "Address deleted" };
}

export async function setDefaultAddressAction(id: string): Promise<ActionResult> {
  const user = await requireUser("/account/addresses");
  await prisma.$transaction([
    prisma.customerAddress.updateMany({ where: { userId: user.id }, data: { isDefault: false } }),
    prisma.customerAddress.update({ where: { id, userId: user.id }, data: { isDefault: true } }),
  ]);
  revalidatePath("/account/addresses");
  return { ok: true };
}
