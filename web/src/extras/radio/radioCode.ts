export const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export type HeardCode = { ok: true; code: string } | { ok: false; reason: "length" | "letter_u" | "symbol" };

export function normalizeHeardCode(input: string): HeardCode {
  const compact = input.trim().replace(/[ -]/g, "");
  if (compact.length !== 4) return { ok: false, reason: "length" };
  if (/[Uu]/.test(compact)) return { ok: false, reason: "letter_u" };
  if (/[^A-Za-z0-9]/.test(compact)) return { ok: false, reason: "symbol" };

  return { ok: true, code: compact.toUpperCase().replace(/[IL]/g, "1").replace(/O/g, "0") };
}

export function compareCodes(heard: string, mine: string | null): "same" | "different" | "no_code_here" {
  if (mine === null) return "no_code_here";
  const result = normalizeHeardCode(heard);
  return result.ok && result.code === mine ? "same" : "different";
}

// Telephony words as printed in the FAA Aeronautical Information Manual, paragraph 4-2-7, Phonetic
// Alphabet (https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap4_section_2.html, read
// 2026-11-18): letters "Alfa" to "Zulu" with the spellings Alfa, Juliett and Xray, digits "Zero" to
// "Nine". Crockford base32 has no I, L, O or U, so those four words are not listed.
export const PHONETIC: Readonly<Record<string, string>> = {
  "0": "Zero",
  "1": "One",
  "2": "Two",
  "3": "Three",
  "4": "Four",
  "5": "Five",
  "6": "Six",
  "7": "Seven",
  "8": "Eight",
  "9": "Nine",
  A: "Alfa",
  B: "Bravo",
  C: "Charlie",
  D: "Delta",
  E: "Echo",
  F: "Foxtrot",
  G: "Golf",
  H: "Hotel",
  J: "Juliett",
  K: "Kilo",
  M: "Mike",
  N: "November",
  P: "Papa",
  Q: "Quebec",
  R: "Romeo",
  S: "Sierra",
  T: "Tango",
  V: "Victor",
  W: "Whiskey",
  X: "Xray",
  Y: "Yankee",
  Z: "Zulu",
};

export function spellCode(code: string): string[] {
  const words: string[] = [];
  for (const character of code) {
    const word = PHONETIC[character];
    if (word === undefined) return [];
    words.push(word);
  }
  return words;
}
