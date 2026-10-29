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
