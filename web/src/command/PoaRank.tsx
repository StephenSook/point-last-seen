import { useEffect, useLayoutEffect, useRef } from "react";
import { formatPct } from "../map/poaStyle";
import { motionScope, playFlip } from "../motion/engine";
import { flipOffsets } from "../motion/flip";

export type RankRow = { segmentId: string; poa: number };

/**
 * Segments by POA, highest first, with the mass outside the grid as its own row. When the
 * order changes, moved rows slide from their old place (FLIP), after `reorderDelayMs`.
 */
export function PoaRank({ rows, row, reorderDelayMs = 0 }: { rows: readonly RankRow[]; row: number | null; reorderDelayMs?: number }) {
  const body = useRef<HTMLTableSectionElement>(null);
  const tops = useRef<Map<string, number>>(new Map());
  const reduced = useRef(false);
  const run = useRef<{ cancel(): void } | null>(null);
  useEffect(() => {
    const scope = motionScope((r) => {
      reduced.current = r;
    });
    return () => {
      run.current?.cancel();
      scope.revert();
    };
  }, []);

  const order = rows.map((r) => r.segmentId).join(",");
  useLayoutEffect(() => {
    const els = new Map<string, HTMLElement>();
    body.current?.querySelectorAll<HTMLElement>("tr[data-seg]").forEach((e) => els.set(e.dataset["seg"]!, e));
    run.current?.cancel();
    // offsetTop ignores transforms, so these are the layout places, old and new.
    const now = new Map([...els].map(([id, e]) => [id, e.offsetTop] as const));
    const moved = flipOffsets(tops.current, now);
    tops.current = now;
    if (moved.length > 0) run.current = playFlip(moved.map((m) => ({ el: els.get(m.id)!, dy: m.dy })), reorderDelayMs, reduced.current);
  }, [order]);

  return (
    <section aria-labelledby="rank-h">
      <h2 id="rank-h" className="label">POA</h2>
      {rows.length === 0 ? (
        <p>No segments yet.</p>
      ) : (
        <table className="rank" data-testid="poa-rank">
          <tbody ref={body}>
            {rows.map((r) => (
              <tr key={r.segmentId} data-seg={r.segmentId}>
                <td>{r.segmentId}</td>
                <td className="num">{formatPct(r.poa)}</td>
              </tr>
            ))}
            {row !== null && (
              <tr className="row">
                <td>Outside the mapped area</td>
                <td className="num">{formatPct(row)}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
