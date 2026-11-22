// Scores one note read against the fields the note states (web/harness/note-measure.html). A stated field is right
// on its exact value; free text ignores case, outer spaces and a leading article. A field the note does not state
// counts as filled when the reading gives anything but "unknown" or an empty string.

export type NoteFields = { direction: string; topColor: string; bottomColor: string; footwear: string; carried: string };
export type NoteScore = { stated: number; right: number; misses: string[]; unstatedFilled: string[] };

const FIELDS: readonly (keyof NoteFields)[] = ["direction", "topColor", "bottomColor", "footwear", "carried"];
const FREE_TEXT = new Set<keyof NoteFields>(["footwear", "carried"]);
const norm = (s: string) => s.trim().toLowerCase().replace(/^(a|an|the)\s+/, "");
const empty = (s: string) => s.trim() === "" || s.trim().toLowerCase() === "unknown";

/** `want` holds only the fields the note states; `skip` names fields the note leaves unclear, scored neither way. */
export function scoreNote(want: Partial<NoteFields>, got: NoteFields | null, skip: readonly (keyof NoteFields)[] = []): NoteScore {
  const misses: string[] = [];
  const unstatedFilled: string[] = [];
  let stated = 0;
  for (const f of FIELDS) {
    if (skip.includes(f)) continue;
    const w = want[f];
    if (w !== undefined) {
      stated++;
      const g = got?.[f];
      const right = g !== undefined && (FREE_TEXT.has(f) ? norm(g) === norm(w) : g === w);
      if (!right) misses.push(f);
    } else if (got && !empty(got[f])) unstatedFilled.push(f);
  }
  return { stated, right: stated - misses.length, misses, unstatedFilled };
}
