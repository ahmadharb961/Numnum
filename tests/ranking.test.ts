import { describe, expect, it } from "vitest";
import { diversify, rankReels, DEFAULT_RANK_WEIGHTS } from "@/lib/ranking";

describe("feed ranking", () => {
  it("avoids consecutive reels from the same restaurant", () => {
    const list = [{ restaurantId: "a" }, { restaurantId: "a" }, { restaurantId: "a" }, { restaurantId: "b" }, { restaurantId: "c" }];
    const out = diversify(list, 1).map((x) => x.restaurantId);
    expect(out.slice(0, 4)).toEqual(["a", "b", "a", "c"]);
  });
  it("favours featured and recent reels", () => {
    const now = new Date();
    const base = { viewCount: 0, likeCount: 0, shareCount: 0, saveCount: 0, orderInits: 0, sponsored: false };
    const r = rankReels(
      [
        { ...base, id: "old", restaurantId: "a", publishedAt: new Date(now.getTime() - 30 * 86400_000), featured: false },
        { ...base, id: "new", restaurantId: "b", publishedAt: now, featured: false },
        { ...base, id: "feat", restaurantId: "c", publishedAt: new Date(now.getTime() - 10 * 86400_000), featured: true },
      ],
      DEFAULT_RANK_WEIGHTS,
      { now },
    );
    expect(r[0].id).toBe("feat");
    expect(r[r.length - 1].id).toBe("old");
  });
});
