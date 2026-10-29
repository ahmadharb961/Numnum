import Papa from "papaparse";
import { isSupportedCurrency, parseAmount } from "./money";

export const CSV_FIELDS = [
  { key: "sku", label: "SKU", required: true, aliases: ["sku", "item code", "code", "item id", "product code", "ref"] },
  { key: "category", label: "Category", required: true, aliases: ["category", "menu category", "section", "group", "الفئة"] },
  { key: "name", label: "Item name", required: true, aliases: ["item name", "name", "item", "dish", "product", "title", "الاسم"] },
  { key: "description", label: "Description", required: false, aliases: ["description", "desc", "details", "الوصف"] },
  { key: "ingredients", label: "Ingredients", required: false, aliases: ["ingredients", "contents", "المكونات"] },
  { key: "price", label: "Price", required: true, aliases: ["price", "cost", "amount", "unit price", "السعر"] },
  { key: "currency", label: "Currency", required: false, aliases: ["currency", "curr"] },
  { key: "availability", label: "Availability", required: false, aliases: ["availability", "available", "in stock", "status", "active"] },
  { key: "image", label: "Image filename", required: false, aliases: ["image filename", "image", "photo", "image file", "picture", "filename"] },
  { key: "allergens", label: "Allergens", required: false, aliases: ["allergens", "allergen information", "allergy"] },
  { key: "dietary", label: "Dietary labels", required: false, aliases: ["dietary labels", "dietary", "diet", "labels", "tags"] },
  { key: "prepTime", label: "Preparation time (min)", required: false, aliases: ["preparation time", "prep time", "prep", "preparation"] },
] as const;

export type CsvFieldKey = (typeof CSV_FIELDS)[number]["key"];
export type ColumnMapping = Partial<Record<CsvFieldKey, string>>;

export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_CSV_ROWS = 5000;

export type ParsedCsv = { headers: string[]; rows: Record<string, string>[]; parseErrors: { row: number; message: string }[] };

export function decodeCsvBytes(bytes: Uint8Array): { ok: true; text: string } | { ok: false; error: string } {
  if (bytes.byteLength > MAX_CSV_BYTES) return { ok: false, error: `File is too large (max ${MAX_CSV_BYTES / 1024 / 1024} MB)` };
  let b = bytes;
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
  if ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff)) {
    return { ok: false, error: "File is UTF-16 encoded. Please save the CSV as UTF-8 (Excel: “CSV UTF-8 (Comma delimited)”)" };
  }
  try {
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(b) };
  } catch {
    return { ok: false, error: "Invalid file encoding. Please save the CSV as UTF-8 (Excel: “CSV UTF-8 (Comma delimited)”) and upload again" };
  }
}

export function parseCsv(text: string): ParsedCsv {
  const res = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const headers = (res.meta.fields ?? []).filter((h) => h !== "");
  const parseErrors = res.errors.map((e) => ({ row: (e.row ?? 0) + 2, message: e.message }));
  return { headers, rows: res.data, parseErrors };
}

const norm = (s: string) => s.toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();

export function autoMapColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  for (const f of CSV_FIELDS) {
    const hit = headers.find((h) => !used.has(h) && (f.aliases as readonly string[]).includes(norm(h)));
    if (hit) {
      mapping[f.key] = hit;
      used.add(hit);
    }
  }
  return mapping;
}

export type ImportRow = {
  row: number; // 1-based line number in the file (header = 1)
  sku: string;
  category: string;
  name: string;
  description: string | null;
  ingredients: string | null;
  priceCents: number | null;
  currency: string;
  available: boolean;
  image: string | null;
  allergens: string | null;
  dietaryLabels: string[];
  prepTimeMinutes: number | null;
  errors: string[];
  warnings: string[];
  action?: "create" | "update";
};

const TRUE_VALUES = ["yes", "y", "true", "1", "available", "in stock", "active", "نعم"];
const FALSE_VALUES = ["no", "n", "false", "0", "unavailable", "out of stock", "sold out", "inactive", "لا"];

export function validateRows(
  parsed: ParsedCsv,
  mapping: ColumnMapping,
  opts: { restaurantCurrency: string; existingSkus?: Set<string> },
): { rows: ImportRow[]; fileErrors: string[] } {
  const fileErrors: string[] = [];
  for (const f of CSV_FIELDS) {
    if (f.required && !mapping[f.key]) fileErrors.push(`Map a column to “${f.label}”`);
  }
  if (parsed.rows.length === 0) fileErrors.push("The file has no data rows");
  if (parsed.rows.length > MAX_CSV_ROWS) fileErrors.push(`Too many rows (${parsed.rows.length}). Maximum is ${MAX_CSV_ROWS} per import`);

  const malformed = new Map<number, string>();
  for (const e of parsed.parseErrors) malformed.set(e.row, e.message);

  const get = (r: Record<string, string>, k: CsvFieldKey) => {
    const col = mapping[k];
    const v = col ? r[col] : undefined;
    return typeof v === "string" ? v.trim() : "";
  };

  const seen = new Map<string, number>();
  const rows: ImportRow[] = parsed.rows.slice(0, MAX_CSV_ROWS).map((r, i) => {
    const line = i + 2;
    const errors: string[] = [];
    const warnings: string[] = [];
    if (malformed.has(line)) errors.push(`Malformed row: ${malformed.get(line)}`);

    const sku = get(r, "sku");
    const name = get(r, "name");
    const category = get(r, "category");
    if (!sku) errors.push("Missing SKU");
    else if (sku.length > 64 || !/^[\p{L}\p{N}._\-]+$/u.test(sku)) errors.push("SKU may only contain letters, numbers, dot, dash and underscore (max 64)");
    if (!name) errors.push("Missing item name");
    else if (name.length > 120) errors.push("Item name is longer than 120 characters");
    if (!category) errors.push("Missing category");

    const currencyRaw = get(r, "currency").toUpperCase();
    const currency = currencyRaw || opts.restaurantCurrency;
    if (!isSupportedCurrency(currency)) errors.push(`Unsupported currency “${currencyRaw}” (use USD or LBP)`);
    else if (currency !== opts.restaurantCurrency) errors.push(`Currency ${currency} does not match your menu currency (${opts.restaurantCurrency})`);

    const priceRaw = get(r, "price");
    let priceCents: number | null = null;
    if (!priceRaw) errors.push("Missing price");
    else {
      priceCents = parseAmount(priceRaw, isSupportedCurrency(currency) ? currency : "USD");
      if (priceCents === null) errors.push(`Invalid price “${priceRaw}”`);
      else if (priceCents < 0) errors.push("Price cannot be negative");
      else if (priceCents === 0) warnings.push("Price is 0");
    }

    const availRaw = get(r, "availability").toLowerCase();
    let available = true;
    if (availRaw) {
      if (TRUE_VALUES.includes(availRaw)) available = true;
      else if (FALSE_VALUES.includes(availRaw)) available = false;
      else errors.push(`Invalid availability “${availRaw}” (use yes/no)`);
    }

    const prepRaw = get(r, "prepTime");
    let prepTimeMinutes: number | null = null;
    if (prepRaw) {
      const n = Number(prepRaw.replace(/min(utes)?/i, "").trim());
      if (!Number.isInteger(n) || n < 0 || n > 600) warnings.push(`Ignored invalid preparation time “${prepRaw}”`);
      else prepTimeMinutes = n;
    }

    const description = get(r, "description");
    if (description.length > 1000) errors.push("Description is longer than 1000 characters");
    const image = get(r, "image");
    if (image && !/\.(jpe?g|png|webp|heic|heif)$/i.test(image)) warnings.push(`Image “${image}” is not a supported image type`);

    if (sku) {
      const key = sku.toLowerCase();
      if (seen.has(key)) errors.push(`Duplicate SKU (also on row ${seen.get(key)})`);
      else seen.set(key, line);
    }

    const action = sku && opts.existingSkus?.has(sku.toLowerCase()) ? "update" : "create";
    if (!description) warnings.push("No description");

    return {
      row: line,
      sku,
      category,
      name,
      description: description || null,
      ingredients: get(r, "ingredients") || null,
      priceCents,
      currency,
      available,
      image: image || null,
      allergens: get(r, "allergens") || null,
      dietaryLabels: get(r, "dietary").split(/[,;|]/).map((s) => s.trim()).filter(Boolean),
      prepTimeMinutes,
      errors,
      warnings,
      action,
    };
  });
  return { rows, fileErrors };
}

export function errorReportCsv(rows: ImportRow[]): string {
  const data = rows
    .filter((r) => r.errors.length || r.warnings.length)
    .map((r) => ({ row: r.row, sku: r.sku, name: r.name, errors: r.errors.join(" | "), warnings: r.warnings.join(" | ") }));
  return Papa.unparse(data, { columns: ["row", "sku", "name", "errors", "warnings"] });
}

export const SAMPLE_CSV = [
  "sku,category,item_name,description,ingredients,price,currency,availability,image_filename,allergens,dietary_labels,preparation_time",
  'BRG001,Burgers,Double Smash Burger,"Two smashed beef patties, cheddar, house sauce","Beef, cheddar, brioche bun, pickles, onion, house sauce",7.50,USD,yes,BRG001.jpg,"Gluten, Dairy",,12',
  'BRG002,Burgers,Crispy Chicken Burger,"Buttermilk fried chicken, slaw, spicy mayo","Chicken, flour, cabbage, mayo, brioche bun",6.75,USD,yes,BRG002.jpg,"Gluten, Egg",,12',
  "SD001,Sides,French Fries,Crispy skin-on fries,\"Potato, salt, sunflower oil\",3.00,USD,yes,SD001.jpg,,\"Vegan, Vegetarian\",6",
  "DR001,Drinks,Fresh Lemonade,Squeezed daily with mint,\"Lemon, sugar, mint, water\",2.50,USD,yes,DR001.jpg,,Vegan,3",
].join("\n");
