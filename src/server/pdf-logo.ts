import "server-only";
import type { Color, PDFPage } from "pdf-lib";
import { NUM_H, NUM_PATH, NUM_W, ROW_W } from "@/lib/logo";

/** Draws the one-line numnum logo as vectors; (x, top) is its top-left corner, in PDF points. */
export function drawLogo(page: PDFPage, x: number, top: number, height: number, color: Color) {
  const scale = height / NUM_H;
  page.drawSvgPath(NUM_PATH, { x, y: top, scale, color, borderWidth: 0 });
  page.drawSvgPath(NUM_PATH, { x: x + (ROW_W - NUM_W) * scale, y: top, scale, color, borderWidth: 0 });
  return ROW_W * scale;
}
