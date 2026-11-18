import { inflateSync } from "node:zlib";
import type { Page } from "@playwright/test";

/** The colour of one screen pixel, read from a 1x1 PNG screenshot (no image library needed). */
export async function pixelAt(page: Page, x: number, y: number): Promise<[number, number, number]> {
  const png = await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 } });
  let off = 8;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString("ascii", off + 4, off + 8);
    const data = png.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") colorType = data[9]!;
    if (type === "IDAT") idat.push(data);
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  if (colorType !== 2 && colorType !== 6) throw new Error(`unexpected PNG colour type ${colorType}`);
  return [raw[1]!, raw[2]!, raw[3]!]; // byte 0 is the row filter; one pixel needs no unfiltering
}

export function hex(rgb: [number, number, number]): string {
  return "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function near(a: [number, number, number], b: string, tol = 12): boolean {
  const t = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return a.every((v, i) => Math.abs(v - t[i]!) <= tol);
}
