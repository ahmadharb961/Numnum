// Simple configurable feed ranking with diversity constraint.

export type RankWeights = {
  recency: number;
  engagement: number;
  proximity: number;
  category: number;
  featured: number;
  halfLifeHours: number;
  maxConsecutiveSameRestaurant: number;
};

export const DEFAULT_RANK_WEIGHTS: RankWeights = {
  recency: 1,
  engagement: 1,
  proximity: 0.6,
  category: 0.5,
  featured: 1.5,
  halfLifeHours: 72,
  maxConsecutiveSameRestaurant: 1,
};

export type RankCandidate = {
  id: string;
  restaurantId: string;
  publishedAt: Date;
  viewCount: number;
  likeCount: number;
  shareCount: number;
  saveCount: number;
  orderInits: number;
  featured: boolean;
  sponsored: boolean;
  /** true when the restaurant delivers to the viewer's chosen location, null when unknown */
  deliversToViewer?: boolean | null;
  foodCategoryId?: string | null;
};

export type RankContext = { now?: Date; preferredCategories?: string[] };

export function scoreReel(c: RankCandidate, w: RankWeights, ctx: RankContext): number {
  const now = ctx.now ?? new Date();
  const ageHours = Math.max(0, (now.getTime() - c.publishedAt.getTime()) / 3.6e6);
  const recency = Math.pow(0.5, ageHours / Math.max(1, w.halfLifeHours));
  // engagement rate with Bayesian smoothing so new reels aren't punished
  const interactions = c.likeCount + 2 * c.shareCount + 2 * c.saveCount + 4 * c.orderInits;
  const engagement = (interactions + 1) / (c.viewCount + 20);
  const engagementScore = Math.min(1, engagement * 4);
  // Restaurants that can deliver to the viewer rank higher; ones that can't are pushed down.
  const proximity = c.deliversToViewer === true ? 1 : c.deliversToViewer === false ? -1 : 0;
  const category = c.foodCategoryId && ctx.preferredCategories?.includes(c.foodCategoryId) ? 1 : 0;
  const featured = c.featured || c.sponsored ? 1 : 0;
  return w.recency * recency + w.engagement * engagementScore + w.proximity * proximity + w.category * category + w.featured * featured;
}

/** Re-orders a ranked list so that the same restaurant doesn't appear more than N times in a row. */
export function diversify<T extends { restaurantId: string }>(ranked: T[], maxConsecutive: number): T[] {
  const pool = [...ranked];
  const out: T[] = [];
  while (pool.length) {
    const recent = out.slice(-maxConsecutive);
    const blocked = recent.length === maxConsecutive && recent.every((r) => r.restaurantId === recent[0].restaurantId) ? recent[0]?.restaurantId : null;
    const idx = blocked ? pool.findIndex((p) => p.restaurantId !== blocked) : 0;
    out.push(pool.splice(idx === -1 ? 0 : idx, 1)[0]);
  }
  return out;
}

export function rankReels<T extends RankCandidate>(cands: T[], w: RankWeights, ctx: RankContext): T[] {
  const scored = cands.map((c) => ({ c, s: scoreReel(c, w, ctx) }));
  scored.sort((a, b) => b.s - a.s || b.c.publishedAt.getTime() - a.c.publishedAt.getTime());
  return diversify(scored.map((x) => x.c), Math.max(1, w.maxConsecutiveSameRestaurant));
}
