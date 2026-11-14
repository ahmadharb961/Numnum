import sharp from "sharp";
import { prisma } from "@/server/db";
import { getBlob } from "@/server/storage";

export const runtime = "nodejs";

const W = 1200;
const H = 630;

/** The picture to preview: a reel's cover, a dish's main photo or a restaurant's cover. */
async function sourceUrl(kind: string, id: string): Promise<string | null> {
  if (kind === "reel") return (await prisma.reel.findFirst({ where: { id, visibility: "PUBLISHED" }, select: { posterUrl: true } }))?.posterUrl ?? null;
  if (kind === "item") {
    const img = await prisma.menuItemImage.findFirst({ where: { menuItemId: id, menuItem: { archived: false } }, orderBy: [{ isMain: "desc" }, { sortOrder: "asc" }], select: { asset: { select: { url: true } } } });
    return img?.asset.url ?? null;
  }
  if (kind === "restaurant") {
    const r = await prisma.restaurant.findFirst({ where: { slug: id, status: "ACTIVE" }, select: { coverUrl: true, logoUrl: true } });
    return r?.coverUrl ?? r?.logoUrl ?? null;
  }
  return null;
}

async function load(url: string): Promise<Buffer | null> {
  const local = url.match(/^\/media\/i\/([a-z0-9]{20,40})(_t)?\.webp/);
  if (local) return getBlob(local[1], "main");
  if (!/^https:\/\//.test(url)) return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  return res?.ok ? Buffer.from(await res.arrayBuffer()) : null;
}

/**
 * /og/reel/<id>.jpg, /og/item/<id>.jpg, /og/restaurant/<slug>.jpg — the link preview picture for
 * WhatsApp and other apps: 1200×630 JPEG (what they all show reliably), the photo centred over a
 * blurred copy of itself so a portrait reel cover isn't cropped.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id: raw } = await params;
  const id = raw.replace(/\.jpe?g$/, "");
  if (!/^[a-z0-9-]{1,80}$/i.test(id)) return new Response("Not found", { status: 404 });
  const url = await sourceUrl(kind, id);
  const input = url ? await load(url) : null;
  if (!input) return Response.redirect(new URL("/og.png", process.env.APP_URL || "http://localhost:3000"), 302);
  try {
    const bg = await sharp(input).rotate().resize(W, H, { fit: "cover" }).blur(28).modulate({ brightness: 0.55 }).toBuffer();
    const fg = await sharp(input).rotate().resize(W, H, { fit: "inside" }).toBuffer();
    const jpg = await sharp(bg).composite([{ input: fg, gravity: "center" }]).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    return new Response(new Uint8Array(jpg), { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=3600, s-maxage=86400" } });
  } catch {
    return Response.redirect(new URL("/og.png", process.env.APP_URL || "http://localhost:3000"), 302);
  }
}
