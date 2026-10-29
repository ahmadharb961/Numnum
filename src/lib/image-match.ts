// Matches uploaded image filenames to menu SKUs.
// Supports BRG001.jpg, BRG001_2.jpg, BRG001-3.png, brg001 (2).webp

export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic", "heif"];

export type MatchResult = {
  file: string;
  status: "matched" | "unmatched" | "unsupported" | "duplicate";
  sku?: string;
  index?: number;
};

export function parseImageFilename(file: string): { base: string; index: number; ext: string } | null {
  const name = file.split(/[\\/]/).pop() || file;
  const m = name.match(/^(.*)\.([a-z0-9]+)$/i);
  if (!m) return null;
  const ext = m[2].toLowerCase();
  let base = m[1].trim();
  let index = 1;
  const suffix = base.match(/^(.*?)(?:[_-]| \()(\d{1,2})\)?$/);
  if (suffix && suffix[1]) {
    base = suffix[1].trim();
    index = Number(suffix[2]);
  }
  return { base, index, ext };
}

export function matchImagesToSkus(files: string[], skus: string[]): MatchResult[] {
  const skuMap = new Map(skus.map((s) => [s.trim().toLowerCase(), s]));
  const seen = new Set<string>();
  return files.map((file) => {
    const parsed = parseImageFilename(file);
    if (!parsed || !IMAGE_EXTENSIONS.includes(parsed.ext)) return { file, status: "unsupported" };
    // try the full base first (SKUs may legitimately contain _2 etc.)
    const fullBase = (file.split(/[\\/]/).pop() || file).replace(/\.[^.]+$/, "").trim().toLowerCase();
    let sku = skuMap.get(fullBase);
    let index = 1;
    if (!sku) {
      sku = skuMap.get(parsed.base.toLowerCase());
      index = parsed.index;
    }
    if (!sku) return { file, status: "unmatched" };
    const key = `${sku}#${index}`;
    if (seen.has(key)) return { file, status: "duplicate", sku, index };
    seen.add(key);
    return { file, status: "matched", sku, index };
  });
}

const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .split(/[^a-z0-9؀-ۿ]+/)
    .filter((t) => t.length > 1);

/** Filename → item-name similarity suggestions. Suggestions are never applied without confirmation. */
export function suggestByName(file: string, items: { id: string; name: string }[]): { id: string; name: string; score: number } | null {
  const ft = new Set(tokens(file.split(/[\\/]/).pop() || file));
  if (!ft.size) return null;
  let best: { id: string; name: string; score: number } | null = null;
  for (const it of items) {
    const it_ = tokens(it.name);
    if (!it_.length) continue;
    const overlap = it_.filter((t) => ft.has(t)).length;
    const score = overlap / Math.max(it_.length, ft.size);
    if (score > (best?.score ?? 0)) best = { ...it, score };
  }
  return best && best.score >= 0.5 ? best : null;
}
