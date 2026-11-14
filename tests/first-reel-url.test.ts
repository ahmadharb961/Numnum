import { describe, expect, it } from "vitest";
import { firstReelBootScript } from "@/lib/reel-warmup";
import { playableSrc } from "@/lib/video-src";
describe("first reel URL: the page's early <video> and the player load the same address", () => {
  const url = "https://customer-abc.cloudflarestream.com/uid123/manifest/video.m3u8";
  for (const d of [undefined, 0.4, 1.6, 3.25, 9, 40]) {
    it(`boot script and player agree at downlink ${d}`, () => {
      const script = firstReelBootScript({ videoUrl: url }, 0)!;
      let srcSet = "";
      const v: Record<string, unknown> = { canPlayType: () => "maybe", setAttribute() {}, addEventListener() {}, play: () => Promise.resolve(), style: {} };
      Object.defineProperty(v, "src", { set: (x: string) => (srcSet = x), get: () => srcSet });
      const g = { navigator: { connection: d ? { downlink: d } : undefined }, document: { createElement: () => v, body: { appendChild() {} } }, window: {} as Record<string, unknown> };
      new Function("navigator", "document", "window", script)(g.navigator, g.document, g.window);
      expect(srcSet).toBe(playableSrc(url, d ?? null));
    });
  }
});
