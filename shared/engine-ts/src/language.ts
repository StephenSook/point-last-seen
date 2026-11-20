import wordsFile from "../../constants/language-words.json";

function words(text: string): string[] {
  const folded = text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  return folded.split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 0 && !/^\p{N}+$/u.test(w));
}

const ENGLISH = new Set(wordsFile.english);
const FOREIGN = new Set(wordsFile.foreign);

/**
 * Language screen, run before a note may go to the cloud read (shared/constants/language-words.json, `matching`).
 * Folds and splits a note as the evidence pre-screen does; a note does not look English when more than half its
 * words are non-Latin, or when its foreign function words (plus non-Latin words) are at least `minForeign` and more
 * than `foreignOverEnglish` times its English words. An English note quoting Spanish still passes.
 */
export function looksEnglish(text: string): boolean {
  const w = words(text);
  if (w.length === 0) return true;
  const nonLatin = w.filter(x => /[^a-z0-9]/.test(x)).length;
  if (nonLatin * 2 > w.length) return false;
  const english = w.filter(x => ENGLISH.has(x)).length;
  const foreign = w.filter(x => FOREIGN.has(x)).length + nonLatin;
  return !(foreign >= wordsFile.minForeign && foreign > wordsFile.foreignOverEnglish * english);
}
