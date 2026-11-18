import { formatPct } from "../map/poaStyle";

export type RankRow = { segmentId: string; poa: number };

/** Segments by POA, highest first, with the mass outside the grid as its own row. */
export function PoaRank({ rows, row }: { rows: readonly RankRow[]; row: number | null }) {
  return (
    <section aria-labelledby="rank-h">
      <h2 id="rank-h" className="label">POA</h2>
      {rows.length === 0 ? (
        <p>No segments yet.</p>
      ) : (
        <table className="rank" data-testid="poa-rank">
          <tbody>
            {rows.map((r) => (
              <tr key={r.segmentId}>
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
