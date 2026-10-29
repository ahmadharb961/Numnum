import { Readable } from "node:stream";
import { prisma } from "@/server/db";
import { getCurrentUser, hasRole } from "@/server/auth";
import { statLocal, streamLocal } from "@/server/storage";

export const runtime = "nodejs";

/** Payment receipts & verification documents: only the owning restaurant's staff and admins. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const asset = await prisma.mediaAsset.findUnique({ where: { id: (await params).id } });
  if (!asset || !asset.isPrivate) return new Response("Not found", { status: 404 });
  const isAdmin = hasRole(user, "ADMIN");
  if (!isAdmin) {
    const member = asset.restaurantId ? await prisma.restaurantStaff.findFirst({ where: { userId: user.id, restaurantId: asset.restaurantId, role: { in: asset.kind === "RECEIPT" ? ["OWNER"] : ["OWNER", "MANAGER", "STAFF"] } } }) : null;
    if (!member) return new Response("Not found", { status: 404 });
  }
  const thumb = new URL(req.url).searchParams.get("thumb") === "1" && asset.mimeType === "image/webp";
  const key = thumb ? asset.storageKey.replace(/\.webp$/, "_thumb.webp") : asset.storageKey;
  try {
    const st = await statLocal(key, true);
    return new Response(Readable.toWeb(streamLocal(key, true)) as ReadableStream, {
      headers: { "content-type": asset.mimeType, "content-length": String(st.size), "cache-control": "private, no-store", "content-disposition": `inline; filename="${(asset.originalName || "file").replace(/[^\w.\-]/g, "_")}"`, "x-content-type-options": "nosniff" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
