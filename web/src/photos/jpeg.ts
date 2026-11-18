// Photos are standardized before they leave the browser: JPEG, long side at
// most 1536 px, re-encoded through a canvas so no EXIF (place, time, device)
// survives.

export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) throw new Error("The image has no size.");
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function toStandardJpeg(file: Blob, max = 1536): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
    const canvas = new OffscreenCanvas(width, height);
    const g = canvas.getContext("2d");
    if (!g) throw new Error("No canvas.");
    g.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.88 });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}
