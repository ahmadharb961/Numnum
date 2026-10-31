// Instant search matching, shared by the browser and tests. Understands typos, the many ways
// Lebanese dishes are spelled (shawarma / shawerma / chawarma), Arabic script and Arabizi
// (za3tar, man2oushe), and plurals.

/** Lowercase, no accents or Arabic diacritics, Arabizi digits as letters, common spelling folds. */
export function norm(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      // Arabic: drop diacritics/tatweel, unify letter variants
      .replace(/[ً-ٰٟـ]/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      // Arabizi digits written inside Latin words
      .replace(/([a-z])2|2(?=[a-z])/g, "$1a")
      .replace(/([a-z])3|3(?=[a-z])/g, "$1a")
      .replace(/([a-z])7|7(?=[a-z])/g, "$1h")
      .replace(/([a-z])5|5(?=[a-z])/g, "$1kh")
      .replace(/([a-z])8|8(?=[a-z])/g, "$1gh")
      // French/English spelling folds: chawarma → shawarma, manouche → manushe, tabbouleh → tabuleh
      .replace(/ch/g, "sh")
      .replace(/ou|oo/g, "u")
      .replace(/ee/g, "i")
      .replace(/ph/g, "f")
      .replace(/q/g, "k")
      .replace(/([a-z])\1+/g, "$1")
      .replace(/[^a-z0-9؀-ۿ]+/g, " ")
      .trim()
  );
}

export const words = (s: string | null | undefined) => (s ? norm(s).split(" ").filter(Boolean) : []);

// Spellings people use for the same food. Any word in a group also searches for the others.
const SYNONYMS = [
  "shawarma shawerma shawirma shwarma shawarma شاورما",
  "manakish manaish manakeesh manaeesh manousheh manushe manuche mankushe man2ushe mana2ish manoushe mnaish منقوشه مناقيش",
  "falafel felafel فلافل",
  "knefeh kunafa knafeh kanafeh kenafeh kunafeh كنافه",
  "tawuk taouk tawouk tawook طاووق",
  "burger burgers hamburger برغر برجر",
  "pizza pizzas بيتزا",
  "sandwich sandwiches sandwish sandwhich سندويش سندويشات",
  "chicken djej dajaj farrouj فروج دجاج",
  "fries frites batata batatas بطاطا",
  "coffee cafe ahwe ahweh kahwa espresso latte قهوه",
  "dessert desserts sweets helo halawiyat حلو حلويات",
  "juice juices asir aseer عصير",
  "grill grills grilled mashawi meshwe مشاوي",
  "kebab kabab kafta kofta kefta كباب كفته",
  "hummus houmous hommos humus حمص",
  "fattoush fatoush فتوش",
  "tabbouleh tabouleh tabouli tabuleh تبوله",
  "labneh labne labna لبنه",
  "halloumi hallumi halloum hallum حلوم",
  "zaatar zatar zaatar زعتر",
  "kaak kaake kake كعك",
  "breakfast fatour terwia ترويقه فطور",
  "icecream booza bouza buza gelato بوظه",
  "sushi سوشي",
  "pasta spaghetti penne باستا",
  "salad salads salata سلطه",
  "drink drinks beverage beverages soda مشروب مشروبات",
  "steak steaks entrecote ستيك",
  "fish samak سمك",
  "shrimp shrimps kreidis قريدس",
  "wrap wraps",
  "cheese jebne jibne جبنه",
].map((g) => [...new Set(g.split(" ").map(norm))]);

const synonymIndex = new Map<string, string[]>();
for (const g of SYNONYMS) for (const w of g) synonymIndex.set(w, g);

/** A query word and the other spellings it should also find (plurals included). */
export function variants(token: string): string[] {
  const out = new Set([token]);
  if (token.length > 3 && token.endsWith("es")) out.add(token.slice(0, -2));
  if (token.length > 3 && token.endsWith("s")) out.add(token.slice(0, -1));
  for (const t of [...out]) for (const s of synonymIndex.get(t) ?? []) out.add(s);
  // A partly typed synonym ("shawe", "manou") also counts.
  if (token.length >= 4) for (const [w, g] of synonymIndex) if (w.startsWith(token)) g.forEach((s) => out.add(s));
  return [...out];
}

/** Edit distance capped at `max` (returns max + 1 when larger). */
function distance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** How well one query spelling matches one word: 1 whole word, 0.9 start of word, 0.6 typo, 0.45 inside a word. */
function wordScore(q: string, w: string, fuzzy: boolean) {
  if (w === q) return 1;
  if (w.startsWith(q)) return q.length >= 2 ? 0.9 : 0.5;
  // Typos are rarely in the first letter; checking it keeps this fast on phones.
  if (fuzzy && q.length >= 4 && w[0] === q[0]) {
    const max = q.length >= 7 ? 2 : 1;
    // Typo in what's typed so far ("shawra" → "shawarma"), or in the whole word.
    if (distance(q, w.slice(0, q.length), max) <= max || distance(q, w, max) <= max) return 0.6;
  }
  if (q.length >= 3 && w.includes(q)) return 0.45;
  return 0;
}

export type Field = { words: string[]; weight: number };
export type Query = string[][]; // per typed word: its spellings

export function parseQuery(q: string): Query {
  return words(q)
    .slice(0, 6)
    .map(variants);
}

/**
 * Score of a record for the query: every typed word must match some field; 0 when one doesn't.
 * `fuzzy` also accepts typos; search runs without it first and only falls back when nothing matched.
 */
export function scoreFields(query: Query, fields: Field[], fuzzy = true) {
  let total = 0;
  for (const spellings of query) {
    let best = 0;
    for (const f of fields) {
      for (const w of f.words) {
        for (const s of spellings) {
          const sc = wordScore(s, w, fuzzy) * f.weight;
          if (sc > best) best = sc;
        }
      }
    }
    if (best === 0) return 0;
    total += best;
  }
  return total;
}
