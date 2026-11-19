// Each cell's code and percent are placed in POA order, most likely first. A cell whose labels would cover a
// label already placed keeps its dot but hides its labels, so the labels a person can see never overlap. On a
// whole park on a phone that leaves the most likely cells labelled; zooming in brings the rest back. The hidden
// labels stay in the page, so anything that reads the plates still finds every one.

export type Box = { left: number; top: number; right: number; bottom: number };

/** The ids in placing order: highest POA first, ties by id. */
export function labelOrder(poa: Readonly<Record<string, number>>, ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => (poa[b] ?? 0) - (poa[a] ?? 0) || (a < b ? -1 : a > b ? 1 : 0));
}

const touches = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** Indexes of the units (in placing order) whose labels would cover a label placed before them. */
export function overlapping(units: readonly (readonly Box[])[]): Set<number> {
  const placed: Box[] = [];
  const hidden = new Set<number>();
  units.forEach((boxes, i) => {
    if (boxes.some((b) => placed.some((p) => touches(b, p)))) hidden.add(i);
    else placed.push(...boxes);
  });
  return hidden;
}
