import termsFile from "../../constants/evidence-terms.json";

function words(text: string): string[] {
  const folded = text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  return folded.split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 0);
}

const TERMS: string[][] = termsFile.terms.map(words);

/**
 * Possible-evidence pre-screen, run before any model. NFKD fold, drop combining marks, lowercase, split on
 * anything that is not a letter or digit; a term matches when its words appear consecutively. Fails closed.
 */
export function isPossibleEvidence(text: string): boolean {
  const tw = words(text);
  return TERMS.some(t => {
    for (let i = 0; i + t.length <= tw.length; i++) {
      if (t.every((w, j) => tw[i + j] === w)) return true;
    }
    return false;
  });
}
