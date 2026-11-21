// The Android rule's own looped and multi-line checks (PhoneNumbersTest.kt), run on the web port, so the two agree
// beyond the shared cases. The shared cases themselves run in phoneVectors.test.ts.

import { describe, expect, it } from "vitest";
import { REPLACEMENT, removePhoneNumbers } from "./phoneNumbers";

const DIGIT = /\p{Nd}/u;
const noDigit = (text: string) => expect(removePhoneNumbers(text), text).not.toMatch(DIGIT);
const gone = (input: string, pieces: string[]) => {
  const out = removePhoneNumbers(input);
  for (const p of pieces) expect(out, `${input} -> ${out}`).not.toContain(p);
};
const unchanged = (text: string) => expect(removePhoneNumbers(text)).toBe(text);

describe("removePhoneNumbers, the Android rule's own checks", () => {
  it("removes a bracketed and a bare US number in one note", () => {
    expect(removePhoneNumbers("call (404) 555-0142 or 4045550142")).toBe("call [number removed] or [number removed]");
  });

  it("leaves times, dates, segments, distances and short runs alone", () => {
    unchanged("seen at 14:03 on 2026-11-22 in segment AC, about 300 m north, 2 people");
    for (const t of ["Last seen 11/19/2026 at the mill", "Last seen 19.11.26", "Last seen 2026-11-19", "on 3/4/2026"]) unchanged(t);
    unchanged("she is one of two, about 300 m north, walked 5 to 6 km, room 1204");
    for (const t of ["GPS 33.7490, -84.3880", "GPS 33.7490 -84.3880", "12345 67th Ave and 12345 68th Ave", "walked 12,345 steps", "about 2 5km loops", "Atlanta, GA 30301-1234"]) unchanged(t);
  });

  it("removes every piece of a number written against something shaped like search information", () => {
    gone("404.5550142, -84.3880", ["5550142", "404"]);
    gone("Call 1,404,555,0142", ["0142", "555"]);
    gone("Call 91234-5678", ["91234", "5678"]);
    gone("May 4 2026-555-142", ["555", "142"]);
    gone("Call 404-555-19 May", ["404", "555"]);
    gone("Call 404-555-01:42", ["404", "555"]);
    gone("call 404-555-0142m", ["404", "0142"]);
    gone("Call 1-404-555-2026-11-19", ["404", "555"]);
  });

  it("a short number touching a date takes the date with it", () => {
    for (const t of ["team 5 11/19/2026", "zone 2 2026-11-19", "route 66 11/19/2026", "room 1204 11/19/2026", "Seen 11/19/2026, 3 miles north"]) noDigit(t);
  });

  it("a search span beside a short piece takes the whole run", () => {
    gone("Call GA 40455-5014 2", ["40455", "5014"]);
    gone("Call 404,555,014 two", ["404", "014", "two"]);
    gone("Call 4.0455 5.0142", ["0455", "0142"]);
    gone("Call Nov 20 1955 0142", ["1955", "0142"]);
    gone("Call four zero four five five five 0142ft", ["four", "0142"]);
    gone("Call 404 5-15-2026", ["404", "2026"]);
    gone("Call 25/12/26-9-1-26", ["25/12", "9-1"]);
    gone("call 555 0142m", ["555", "0142"]);
    gone("Call 06.12.20-26-19", ["06.12", "26-19"]);
    gone("Call 404-555-2026/11/19", ["404", "555"]);
    gone("Call 404.555.2026-11-19", ["404", "555"]);
    gone("Meet in Atlanta, ga 30301-1234", ["30301"]);
  });

  it("removes a unit on a whole number, overlapping dates, an indented line break and spoken repeats", () => {
    gone("Call 06.12.20-06-19", ["06.12", "06-19"]);
    gone("Call +1 (404) 555-\n    0142", ["404", "0142"]);
    gone("Call +1 (404) 555-\r0142", ["404", "0142"]);
    gone("Call four oh four, triple five, zero one four two", ["four", "triple", "zero"]);
    gone("Call double four zero four five five five one four two", ["double", "five"]);
  });

  it("a spacing accent, a joiner, or a mark outside the BMP between groups still joins them", () => {
    for (const sep of ["´", "¨", "˜", " ́", " ‍", "󠀠", "󠄀", "ः"]) noDigit(`Call 404${sep}555${sep}0142`);
  });

  it("NEL and the Unicode line and paragraph separators join groups", () => {
    for (const br of ["\u0085", "\u2028", "\u2029"]) noDigit(`Call 404-555-${br}0142`);
  });

  it("an Adlam number with commas is removed, not taken for a grouped count", () => {
    expect(removePhoneNumbers("Call 𞥔,𞥐𞥔𞥕,𞥕𞥕𞥐,𞥑𞥔𞥒")).toBe("Call [number removed]");
  });

  it("a wider gap of separators alone still joins one number", () => {
    for (const t of ["Call 404-555 -  0142", "Call 404    555    0142", "Call 404 . . 555 . . 0142"]) expect(removePhoneNumbers(t), t).toBe("Call [number removed]");
  });

  it("a unit glued to the last group, or a long group with an ordinal ending, shields nothing", () => {
    for (const t of ["Call 1-404-555-0142pm", "Call 1 404 555 0142pm", "Call 404-555-0142 5km", "Call 404-555-0142th", "Call 404 555 0142nd"]) noDigit(t);
  });

  it("an ordinal stays apart only as a street name", () => {
    for (const t of ["Call 4550 142nd", "Call 455 0142th please"]) expect(removePhoneNumbers(t), t).not.toMatch(/\d{4}/);
    unchanged("12345 67th Ave. and 12345 125th Street");
    unchanged("near 4550 142nd St");
  });
});

describe("removePhoneNumbers, Spanish spoken digits", () => {
  it("removes a number spoken in Spanish digit words, in any case", () => {
    expect(removePhoneNumbers("Call cuatro cero cuatro cinco cinco cinco cero uno cuatro dos")).toBe("Call [number removed]");
    expect(removePhoneNumbers("Call CUATRO cero cuatro cinco cinco cinco cero uno cuatro dos")).toBe("Call [number removed]");
  });

  it("does not count the articles un and una as digits", () => {
    const t = "Found una chaqueta and un sombrero by the creek";
    expect(removePhoneNumbers(t)).toBe(t);
  });
});

describe("removePhoneNumbers: any punctuation or symbol between digit groups joins them", () => {
  // Kept before this rule: only spaces, - . , ( ) / and dashes joined a number's groups.
  const split = [
    "404 555\u00b70142", "404\u00b7555\u00b70142", "404 \u00b7 555 \u00b7 0142", "404\u2027555\u20270142",
    "404\u2022555\u20220142", "404_555_0142", "404*555*0142", "404 | 555 | 0142", "404;555;0142", "404!555!0142", "404?555?0142",
    // A frequency's shape beside a short piece goes with the run: 404.555 0142 is a phone number.
    "404.555 0142",
  ];
  it.each(split)("removes %j and keeps the words around it", (n) => {
    const out = removePhoneNumbers(`Call ${n} tonight`);
    expect(out).toBe(`Call ${REPLACEMENT} tonight`);
  });
  it("removes a bracketed group; the opening bracket stays, since a run starts at its first digit (or a + or ()", () => {
    expect(removePhoneNumbers("Call [404] 555 0142 tonight")).toBe(`Call [${REPLACEMENT} tonight`);
  });
  it("still removes numbers split by spaces of every width, an em dash, full stops and full-width forms", () => {
    for (const n of ["404\u00a0555\u00a00142", "404\u2009555\u20090142", "404\u202f555\u202f0142", "404\u2014555\u20140142", "404.555.0142",
      "\uff14\uff10\uff14\uff0d\uff15\uff15\uff15\uff0d\uff10\uff11\uff14\uff12"]) {
      expect(removePhoneNumbers(`Call ${n} tonight`)).toBe(`Call ${REPLACEMENT} tonight`);
    }
  });
  it("never joins across a time's colon, a percent or a degree", () => {
    for (const t of ["GPS 33.7490\u00b0, -84.3880\u00b0", "GPS 33\u00b044'56\"N 84\u00b023'17\"W", "POA 45% 30% 15% 10%", "Seen 14:03 14:30"]) {
      expect(removePhoneNumbers(t)).toBe(t);
    }
  });
});

describe("removePhoneNumbers: coordinates and radio frequencies are search information", () => {
  it("keeps a decimal coordinate pair with a semicolon, bullet, middle dot, bar or slash between", () => {
    for (const g of ["; ", " \u2022 ", " \u00b7 ", " | ", " / "]) {
      const t = `GPS 33.7490${g}-84.3880`;
      expect(removePhoneNumbers(t)).toBe(t);
    }
  });
  it("keeps a list of radio frequencies: 1 to 3 digits, a full stop, 3 digits", () => {
    for (const t of ["Radio 155.160 | 154.205", "Radio 146.520, 155.160 and 462.550", "Radio 155.160-155.175", "Ch 155.160 154.205 146.520"]) {
      expect(removePhoneNumbers(t)).toBe(t);
    }
  });
  it("still removes a dotted number, a frequency after a +, and a frequency beside a short piece", () => {
    expect(removePhoneNumbers("Call 404.555.0142")).toBe(`Call ${REPLACEMENT}`);
    expect(removePhoneNumbers("Call +404.555 014.555")).not.toMatch(/\d/);
    expect(removePhoneNumbers("Radio 155.160 404")).toBe(`Radio ${REPLACEMENT}`);
  });
  it("a frequency joined to any other digits goes with the run, so a phone number never keeps a frequency's shape", () => {
    expect(removePhoneNumbers("Radio 155.160 404 5550142")).toBe(`Radio ${REPLACEMENT}`);
    expect(removePhoneNumbers("Call 404.555-0142 #123")).not.toMatch(/\d/);
    expect(removePhoneNumbers("Call 404.555 0142 ext 12")).not.toMatch(/404|555/);
  });
  it("a pair across a semicolon, bullet, middle dot, bar or slash is a coordinate only with a minus: two numbers are removed", () => {
    for (const g of [" / ", " | ", "; ", " \u2022 "]) {
      expect(removePhoneNumbers(`Call 020.79460958${g}020.79460959`)).not.toMatch(/\d/);
    }
  });
});

describe("removePhoneNumbers: a phone number written like a coordinate or a frequency", () => {
  it("a coordinate's whole degrees never start with a zero, so a London number is not a latitude", () => {
    for (const s of ["Call 020.79460958 / -020.79460959", "Call 020.79460958 | -0.1276", "Call 020.79460958, -0.1276"]) {
      expect(removePhoneNumbers(s)).not.toMatch(/79460958/);
    }
    expect(removePhoneNumbers("GPS 0.1276, 51.5072")).toBe("GPS 0.1276, 51.5072");
  });
  it("a frequency is 25 to 999 with no leading zero, and one other group anywhere in the run removes it all", () => {
    expect(removePhoneNumbers("Call 404.555 0.142")).not.toMatch(/\d/);
    expect(removePhoneNumbers("Call 404.555 0.142 1234567")).not.toMatch(/\d/);
    expect(removePhoneNumbers("Call 404.555 012.345")).not.toMatch(/\d/);
    expect(removePhoneNumbers("Radio 27.185 155.160 462.550")).toBe("Radio 27.185 155.160 462.550");
  });
});

