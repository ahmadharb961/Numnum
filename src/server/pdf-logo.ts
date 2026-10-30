import "server-only";
import type { Color, PDFPage } from "pdf-lib";
import { STACK_H, STACK_PATH, STACK_W } from "@/lib/logo";

/** Draws the numnum logo as vectors; (x, top) is its top-left corner, in PDF points. */
export function drawLogo(page: PDFPage, x: number, top: number, height: number, color: Color) {
  const scale = height / STACK_H;
  page.drawSvgPath(STACK_PATH, { x, y: top, scale, color, borderWidth: 0 });
  return STACK_W * scale;
}
