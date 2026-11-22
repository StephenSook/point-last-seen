// Scoring for the photo-read invention measurement (photoInvention.tsx): which words of a read the picture never
// showed, and how much of a sign's own text a read carried. Words are compared upper-cased, split on anything that
// is not a letter or digit, the same folding cleanCues uses for a place name.

const words = (s: string): string[] => s.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);

/** Each word of `read` that is not among the words drawn in the picture, once, in reading order. */
export function inventedWords(read: string, pictureText: readonly string[]): string[] {
  const shown = new Set(pictureText.flatMap(words));
  return [...new Set(words(read).filter((w) => !shown.has(w)))];
}

/** Whether `read` carries all, some or none of the picture's sign words; "no-text" when nothing was drawn. */
export function signRead(read: string, pictureText: readonly string[]): "all" | "some" | "none" | "no-text" {
  const want = [...new Set(pictureText.flatMap(words))];
  if (want.length === 0) return "no-text";
  const got = new Set(words(read));
  const hit = want.filter((w) => got.has(w)).length;
  return hit === want.length ? "all" : hit > 0 ? "some" : "none";
}
