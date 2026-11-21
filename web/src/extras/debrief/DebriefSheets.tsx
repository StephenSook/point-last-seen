import type { JSX } from "react";
import { COVERAGE_TICKS, DEBRIEF_FIELDS, type DebriefFieldKey, type DebriefSheetModel } from "./debriefSheet";

const label = (key: DebriefFieldKey) => DEBRIEF_FIELDS.find((f) => f.key === key)!.label;

/** Character boxes for a short handwritten value; a typed or SAMPLE value fills them one character each. */
function Boxes({ count, value }: { count: number; value: string }) {
  return (
    <span className="extras-debrief-boxes">
      {Array.from({ length: count }, (_, i) => <span key={i} className="extras-debrief-box">{value[i] ?? ""}</span>)}
    </span>
  );
}

/** A labelled box of ruled lines for a handwritten note; on the SAMPLE sheet the note is filled in. */
function Lines({ field, lines, value }: { field: DebriefFieldKey; lines: number; value: string | null }) {
  return (
    <section className="extras-debrief-field extras-debrief-lines" data-field={field}>
      <p className="extras-debrief-label">{label(field)}</p>
      {value !== null && <p className="extras-debrief-hand">{value}</p>}
      {Array.from({ length: lines }, (_, i) => <div key={i} className="extras-debrief-rule" />)}
    </section>
  );
}

/**
 * The printed debrief sheets, one Letter page each. The drill line comes first on every sheet; nothing on it asks for
 * a person's name or phone number. Team and segment print typed when the plan names them.
 */
export function DebriefSheets({ sheets }: { sheets: readonly DebriefSheetModel[] }): JSX.Element {
  return (
    <>
      {sheets.map((s, i) => (
        <article key={i} className="extras-debrief-sheet" data-sample={s.sample ? "true" : undefined}>
          <p className="extras-drill-line">{s.drillLine}</p>
          {s.sample && <p className="extras-debrief-sample-mark">SAMPLE</p>}
          <h2>Search debrief</h2>
          <p className="extras-debrief-lede">
            {s.incidentName} | {s.planLine} | Fill in after the sweep, in BLOCK CAPITALS. One sheet per segment.
          </p>
          <div className="extras-debrief-top">
            <section className="extras-debrief-field" data-field="team">
              <p className="extras-debrief-label">{label("team")}</p>
              {s.teamName !== null ? <p className="extras-debrief-typed">{s.teamName}</p> : <div className="extras-debrief-blank" />}
            </section>
            <section className="extras-debrief-field" data-field="segment">
              <p className="extras-debrief-label">{label("segment")}</p>
              {s.segmentId !== null ? <p className="extras-debrief-typed">{s.segmentId}</p> : <Boxes count={4} value="" />}
            </section>
            <section className="extras-debrief-field" data-field="minutes">
              <p className="extras-debrief-label">{label("minutes")}</p>
              <Boxes count={3} value={s.sample ? String(s.sample.minutes) : ""} />
            </section>
          </div>
          <section className="extras-debrief-field" data-field="coverage">
            <p className="extras-debrief-label">{label("coverage")}</p>
            <div className="extras-debrief-ticks">
              {COVERAGE_TICKS.map((pct) => (
                <span key={pct} className="extras-debrief-tick-wrap">
                  <span className="extras-debrief-tickbox">{s.sample?.coveragePct === pct ? "X" : ""}</span>
                  <span className="extras-tick" data-ticked={s.sample?.coveragePct === pct ? "true" : undefined}>{pct}%</span>
                </span>
              ))}
            </div>
          </section>
          <Lines field="worked" lines={3} value={s.sample?.worked ?? null} />
          <Lines field="didNotWork" lines={3} value={s.sample?.didNotWork ?? null} />
          <Lines field="clues" lines={4} value={s.sample?.clues ?? null} />
          <Lines field="hazards" lines={3} value={s.sample?.hazards ?? null} />
          <footer className="extras-debrief-footer">
            <span>Write no one's name or phone number on this sheet. Command reads it on its laptop and checks every field before saving.</span>
            <span>{s.pageLine}</span>
          </footer>
        </article>
      ))}
    </>
  );
}
