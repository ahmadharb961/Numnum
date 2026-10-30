import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { prisma } from "@/server/db";
import { processImage } from "@/server/media";
import { customerCodeFromUrl, parseTusMetadata, parseVideo, playbackUrls, syncStreamReels } from "@/server/stream";
import { GET as mediaGET } from "@/app/media/[...key]/route";
import { makeRestaurant, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Cloudflare Stream helpers", () => {
  it("parses video state", () => {
    expect(parseVideo({ readyToStream: true, status: { state: "ready" }, duration: 12.4 })).toMatchObject({ ready: true, failed: false, durationSec: 12.4 });
    expect(parseVideo({ status: { state: "error", errorReasonText: "bad codec" } })).toMatchObject({ ready: false, failed: true, error: "bad codec" });
    expect(parseVideo({ status: { state: "inprogress" } })).toMatchObject({ ready: false, failed: false });
  });
  it("builds playback URLs from the customer code", () => {
    expect(customerCodeFromUrl("https://customer-abc123.cloudflarestream.com/uid/manifest/video.m3u8")).toBe("abc123");
    expect(playbackUrls("abc123", "uid1")).toEqual({ hls: "https://customer-abc123.cloudflarestream.com/uid1/manifest/video.m3u8", poster: "https://customer-abc123.cloudflarestream.com/uid1/thumbnails/thumbnail.jpg?time=1s&height=1280" });
  });
  it("decodes tus metadata", () => {
    expect(parseTusMetadata(`filename ${Buffer.from("burger.mp4").toString("base64")},filetype ${Buffer.from("video/mp4").toString("base64")}`)).toEqual({ filename: "burger.mp4", filetype: "video/mp4" });
  });

  it("marks a reel ready (and auto-publishes) once Cloudflare finishes processing", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acc");
    vi.stubEnv("CLOUDFLARE_STREAM_API_TOKEN", "tok");
    const f = await makeRestaurant();
    const asset = await prisma.mediaAsset.create({ data: { restaurantId: f.restaurant.id, kind: "VIDEO", storageKey: "stream:uid42", url: "", mimeType: "video/*", sizeBytes: 1 } });
    const reel = await prisma.reel.create({ data: { restaurantId: f.restaurant.id, menuItemId: f.burger.id, videoAssetId: asset.id, autoPublish: true } });
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ result: { readyToStream: false, status: { state: "inprogress" } } })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await syncStreamReels()).toBe(0);
    fetchMock.mockImplementation(async (_url: string) => new Response(JSON.stringify({ result: { readyToStream: true, status: { state: "ready" }, duration: 9, playback: { hls: "https://customer-xyz.cloudflarestream.com/uid42/manifest/video.m3u8" } } })));
    expect(await syncStreamReels()).toBe(1);
    const r = await prisma.reel.findUniqueOrThrow({ where: { id: reel.id } });
    expect(r).toMatchObject({ status: "READY", visibility: "PUBLISHED", videoUrl: "https://customer-xyz.cloudflarestream.com/uid42/manifest/video.m3u8", durationSec: 9 });
    expect(r.posterUrl).toContain("/thumbnails/thumbnail.jpg");
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.cloudflare.com/client/v4/accounts/acc/stream/uid42");
  });

  it("marks failed uploads", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acc");
    vi.stubEnv("CLOUDFLARE_STREAM_API_TOKEN", "tok");
    const f = await makeRestaurant();
    const asset = await prisma.mediaAsset.create({ data: { restaurantId: f.restaurant.id, kind: "VIDEO", storageKey: "stream:bad", url: "", mimeType: "video/*", sizeBytes: 1 } });
    const reel = await prisma.reel.create({ data: { restaurantId: f.restaurant.id, menuItemId: f.burger.id, videoAssetId: asset.id } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ result: { status: { state: "error", errorReasonText: "Unsupported format" } } }))));
    await syncStreamReels();
    expect(await prisma.reel.findUniqueOrThrow({ where: { id: reel.id } })).toMatchObject({ status: "FAILED", processingError: "Unsupported format" });
  });
});

describe("images stored in the database", () => {
  it("processes, stores and serves a public image with cache headers", async () => {
    const f = await makeRestaurant();
    const jpg = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: "#f60" } }).jpeg().toBuffer();
    const asset = await processImage(jpg, { restaurantId: f.restaurant.id, originalName: "burger.jpg" });
    expect(asset.url).toBe(`/media/i/${asset.id}.webp`);
    expect(asset.thumbUrl).toBe(`/media/i/${asset.id}_t.webp`);
    expect(asset.width).toBe(1200); // resized, aspect preserved
    expect(asset.height).toBe(900);
    const res = await mediaGET(new Request("http://x" + asset.url), { params: Promise.resolve({ key: ["i", `${asset.id}.webp`] }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toContain("immutable");
    const thumb = await mediaGET(new Request("http://x"), { params: Promise.resolve({ key: ["i", `${asset.id}_t.webp`] }) });
    expect((await sharp(Buffer.from(await thumb.arrayBuffer())).metadata()).width).toBe(480);
  });

  it("never serves private receipts through the public route", async () => {
    const f = await makeRestaurant();
    const jpg = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#000" } }).jpeg().toBuffer();
    const receipt = await processImage(jpg, { restaurantId: f.restaurant.id, kind: "RECEIPT", isPrivate: true });
    expect(receipt.url).toBe(`/api/private-media/${receipt.id}`);
    const res = await mediaGET(new Request("http://x"), { params: Promise.resolve({ key: ["i", `${receipt.id}.webp`] }) });
    expect(res.status).toBe(404);
  });
});
