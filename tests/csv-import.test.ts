import { describe, expect, it } from "vitest";
import { autoMapColumns, decodeCsvBytes, parseCsv, validateRows, SAMPLE_CSV, errorReportCsv } from "@/lib/csv-import";
import { matchImagesToSkus } from "@/lib/image-match";

describe("CSV import", () => {
  it("auto-maps sample template headers", () => {
    const p = parseCsv(SAMPLE_CSV);
    const m = autoMapColumns(p.headers);
    expect(m).toMatchObject({ sku: "sku", category: "category", name: "item_name", price: "price", image: "image_filename", dietary: "dietary_labels", prepTime: "preparation_time" });
    const { rows, fileErrors } = validateRows(p, m, { restaurantCurrency: "USD" });
    expect(fileErrors).toEqual([]);
    expect(rows.every((r) => r.errors.length === 0)).toBe(true);
    expect(rows[0].priceCents).toBe(750);
    expect(rows[2].dietaryLabels).toEqual(["Vegan", "Vegetarian"]);
  });

  it("reports row-specific errors", () => {
    const csv = ["sku,category,name,price,currency,availability", "A1,Burgers,,7,USD,yes", "A1,Burgers,Dup,abc,USD,maybe", "A3,,Item,5,EUR,yes", "A4,Sides,Ok,-2,USD,no"].join("\n");
    const p = parseCsv(csv);
    const { rows } = validateRows(p, autoMapColumns(p.headers), { restaurantCurrency: "USD" });
    expect(rows[0].errors).toContain("Missing item name");
    expect(rows[1].errors.join()).toMatch(/Duplicate SKU/);
    expect(rows[1].errors.join()).toMatch(/Invalid price/);
    expect(rows[1].errors.join()).toMatch(/Invalid availability/);
    expect(rows[2].errors.join()).toMatch(/Missing category/);
    expect(rows[2].errors.join()).toMatch(/Unsupported currency/);
    expect(rows[3].errors.join()).toMatch(/negative/);
    expect(errorReportCsv(rows).split("\n").length).toBeGreaterThan(3);
  });

  it("supports Arabic UTF-8 and rejects invalid encodings", () => {
    const text = "sku,category,name,price\nL1,مشاوي,شاورما دجاج,4.5";
    const ok = decodeCsvBytes(new TextEncoder().encode("﻿" + text));
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      const p = parseCsv(ok.text);
      const { rows } = validateRows(p, autoMapColumns(p.headers), { restaurantCurrency: "USD" });
      expect(rows[0].name).toBe("شاورما دجاج");
      expect(rows[0].errors).toEqual([]);
    }
    expect(decodeCsvBytes(new Uint8Array([0x73, 0x6b, 0x75, 0xff, 0xfe, 0x0a])).ok).toBe(false);
  });

  it("flags missing required mappings", () => {
    const p = parseCsv("foo,bar\n1,2");
    expect(validateRows(p, autoMapColumns(p.headers), { restaurantCurrency: "USD" }).fileErrors.length).toBeGreaterThan(0);
  });

  it("marks existing SKUs as updates", () => {
    const p = parseCsv(SAMPLE_CSV);
    const { rows } = validateRows(p, autoMapColumns(p.headers), { restaurantCurrency: "USD", existingSkus: new Set(["brg001"]) });
    expect(rows[0].action).toBe("update");
    expect(rows[1].action).toBe("create");
  });
});

describe("image filename matching", () => {
  it("matches SKUs with numbered variants", () => {
    const r = matchImagesToSkus(["BRG001.jpg", "BRG001_2.jpg", "brg001-3.PNG", "BRG002.webp", "XYZ.jpg", "notes.txt", "BRG001.png"], ["BRG001", "BRG002"]);
    expect(r.map((x) => x.status)).toEqual(["matched", "matched", "matched", "matched", "unmatched", "unsupported", "duplicate"]);
    expect(r[1].index).toBe(2);
  });
  it("matches 150 SKUs", () => {
    const skus = Array.from({ length: 150 }, (_, i) => `ITM${String(i).padStart(3, "0")}`);
    const r = matchImagesToSkus(skus.map((s) => `${s}.jpg`), skus);
    expect(r.filter((x) => x.status === "matched").length).toBe(150);
  });
});
