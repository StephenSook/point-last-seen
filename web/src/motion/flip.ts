// FLIP for the rank list (written by hand, spec 22.1): measure each row before and after
// a reorder, then start each moved row at its old place and slide it to the new one.

/** dy = old top minus new top, for rows present in both measurements that moved. In the new order. */
export function flipOffsets(before: ReadonlyMap<string, number>, after: ReadonlyMap<string, number>): { id: string; dy: number }[] {
  return [...after.entries()].flatMap(([id, top]) => {
    const old = before.get(id);
    return old === undefined || old === top ? [] : [{ id, dy: old - top }];
  });
}
