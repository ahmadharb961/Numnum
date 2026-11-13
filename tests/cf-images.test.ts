import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { processImage } from "@/server/media";
import { getBlob } from "@/server/storage";
import { movePhotosToCloudflare, photoCounts } from "@/server/cf-images";
import { makeRestaurant, resetDb } from "./helpers";

const HASH = "AbCdEf123";
type Call = { method: string; path: string; id?: string | null };

/** A stand-in for Cloudflare's Images API: records calls, stores uploaded ids, can refuse. */
function fakeCloudflare(opts: { deny?: boolean } = {}) {
  const calls: Call[] = [];
  const stored = new Set<string>();
  let variant = false;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(input);
      const path = url.pathname.replace(/^\/client\/v4\/accounts\/acc1\/images/, "");
      const method = init.method ?? "GET";
      const id = init.body instanceof FormData ? (init.body.get("id") as string) : null;
      calls.push({ method, path, id });
      if (opts.deny) return json(403, { success: false, errors: [{ code: 10000, message: "Authentication error" }] });
      if (path === "/v1/variants/orig") return variant ? json(200, { success: true, result: {} }) : json(404, { success: false, errors: [{ code: 5404, message: "not found" }] });
      if (path === "/v1/variants" && method === "POST") {
        variant = true;
        return json(200, { success: true, result: {} });
      }
      if (path === "/v1" && method === "POST") {
        if (stored.has(id!)) return json(409, { success: false, errors: [{ code: 5409, message: "Resource already exists" }] });
        stored.add(id!);
        return json(200, { success: true, result: { id, variants: [`https://imagedelivery.net/${HASH}/${id}/orig`] } });
      }
      if (path.startsWith("/v1/") && method === "GET") return json(200, { success: true, result: { variants: [`https://imagedelivery.net/${HASH}/${decodeURIComponent(path.slice(4))}/orig`] } });
      if (path.startsWith("/v1/") && method === "DELETE") return json(200, { success: true, result: {} });
      return json(404, { success: false, errors: [{ code: 404, message: "unexpected " + path }] });
    }),
  );
  return { calls, stored };
}

const photo = () => sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#e44" } }).jpeg().toBuffer();

beforeEach(async () => {
  await resetDb();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Cloudflare Images", () => {
  it("without Cloudflare settings, photos are served by our server as before", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
    const f = await makeRestaurant();
    const a = await processImage(await photo(), { restaurantId: f.restaurant.id, originalName: "x.jpg" });
    expect(a.url).toBe(`/media/i/${a.id}.webp`);
    expect(a.storageKey).toBe("db");
  });

  it("new photos go to Cloudflare (main + thumbnail) and keep a backup copy in the database", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acc1");
    vi.stubEnv("CLOUDFLARE_STREAM_API_TOKEN", "tok");
    const cf = fakeCloudflare();
    const f = await makeRestaurant();
    const a = await processImage(await photo(), { restaurantId: f.restaurant.id, originalName: "x.jpg" });
    expect(a.url).toBe(`https://imagedelivery.net/${HASH}/${a.id}/orig`);
    expect(a.thumbUrl).toBe(`https://imagedelivery.net/${HASH}/${a.id}_t/orig`);
    expect(a.storageKey).toBe("cf");
    expect([...cf.stored].sort()).toEqual([a.id, `${a.id}_t`].sort());
    expect(cf.calls.some((c) => c.path === "/v1/variants" && c.method === "POST")).toBe(true); // "orig" variant created once
    expect(await getBlob(a.id, "main")).toBeTruthy(); // backup kept
  });

  it("private documents (receipts, IDs) never go to Cloudflare", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acc1");
    vi.stubEnv("CLOUDFLARE_STREAM_API_TOKEN", "tok");
    const cf = fakeCloudflare();
    const f = await makeRestaurant();
    const a = await processImage(await photo(), { restaurantId: f.restaurant.id, isPrivate: true, kind: "RECEIPT" });
    expect(a.url).toBe(`/api/private-media/${a.id}`);
    expect(cf.calls).toHaveLength(0);
  });

  it("a token without the Images permission: the upload still works, served by our server", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acc1");
    vi.stubEnv("CLOUDFLARE_STREAM_API_TOKEN", "tok");
    fakeCloudflare({ deny: true });
    const f = await makeRestaurant();
    const a = await processImage(await photo(), { restaurantId: f.restaurant.id, originalName: "x.jpg" });
    expect(a.url).toBe(`/media/i/${a.id}.webp`);
  });

  it("moves existing photos and updates every place that shows them", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
    const f = await makeRestaurant();
    const logo = await processImage(await photo(), { restaurantId: f.restaurant.id, originalName: "logo.jpg" });
    const cover = await processImage(await sharp({ create: { width: 900, height: 500, channels: 3, background: "#228" } }).jpeg().toBuffer(), { restaurantId: f.restaurant.id, originalName: "cover.jpg" });
    await prisma.restaurant.update({ where: { id: f.restaurant.id }, data: { logoUrl: logo.url, coverUrl: cover.url } });
    await prisma.foodCategory.create({ data: { slug: "pizza", name: "Pizza", imageUrl: logo.thumbUrl } });

    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acc1");
    vi.stubEnv("CLOUDFLARE_STREAM_API_TOKEN", "tok");
    const cf = fakeCloudflare();
    expect(await photoCounts()).toEqual({ server: 2, cloudflare: 0 });
    const r = await movePhotosToCloudflare(1); // small batches
    expect(r).toMatchObject({ moved: 1, remaining: 1, error: null });
    expect(await movePhotosToCloudflare(10)).toMatchObject({ moved: 1, remaining: 0, error: null });
    expect(await photoCounts()).toEqual({ server: 0, cloudflare: 2 });

    const rest = await prisma.restaurant.findUniqueOrThrow({ where: { id: f.restaurant.id } });
    expect(rest.logoUrl).toBe(`https://imagedelivery.net/${HASH}/${logo.id}/orig`);
    expect(rest.coverUrl).toBe(`https://imagedelivery.net/${HASH}/${cover.id}/orig`);
    expect((await prisma.foodCategory.findFirstOrThrow()).imageUrl).toBe(`https://imagedelivery.net/${HASH}/${logo.id}_t/orig`);
    expect(cf.stored.size).toBe(4);

    // Running it again is harmless
    expect(await movePhotosToCloudflare(10)).toMatchObject({ moved: 0, remaining: 0 });
  });

  it("moving photos stops with a clear reason when the token lacks the permission", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
    const f = await makeRestaurant();
    await processImage(await photo(), { restaurantId: f.restaurant.id, originalName: "x.jpg" });
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acc1");
    vi.stubEnv("CLOUDFLARE_STREAM_API_TOKEN", "tok");
    fakeCloudflare({ deny: true });
    const r = await movePhotosToCloudflare(10);
    expect(r.moved).toBe(0);
    expect(r.remaining).toBe(1);
    expect(r.error).toMatch(/Cloudflare Images: Edit/);
  });

  it("a photo already on Cloudflare (e.g. an earlier attempt) isn't uploaded twice", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
    const f = await makeRestaurant();
    const a = await processImage(await photo(), { restaurantId: f.restaurant.id, originalName: "x.jpg" });
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acc1");
    vi.stubEnv("CLOUDFLARE_STREAM_API_TOKEN", "tok");
    const cf = fakeCloudflare();
    cf.stored.add(a.id); // uploaded before, but the database wasn't updated
    cf.stored.add(`${a.id}_t`);
    expect(await movePhotosToCloudflare(10)).toMatchObject({ moved: 1, remaining: 0, error: null });
    expect((await prisma.mediaAsset.findUniqueOrThrow({ where: { id: a.id } })).url).toBe(`https://imagedelivery.net/${HASH}/${a.id}/orig`);
  });
});
