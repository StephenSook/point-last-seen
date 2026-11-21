// The practice search's one-click first report (firstReport.ts): the report, one button, and the step it is on.

export type FirstReportState = { phase: "idle" | "saving" | "confirming"; error?: string };

const STEP: Record<FirstReportState["phase"], string | null> = {
  idle: null,
  saving: "Saving the report...",
  confirming: "Confirming it as the new last known point...",
};

export function FirstReportCard({ line, state, onAdd }: { line: string; state: FirstReportState; onAdd: () => void }) {
  const step = STEP[state.phase];
  return (
    <section className="first-report" aria-labelledby="first-report-h" data-testid="first-report">
      <h2 id="first-report-h" className="label">Try a report</h2>
      <p>{line}</p>
      <button type="button" className="btn" onClick={onAdd} disabled={state.phase !== "idle"}>
        Add and confirm this report
      </button>
      <p className="muted small">It is saved and confirmed like any report, and the map moves to it.</p>
      {step && <p role="status">{step}</p>}
      {state.error && <p role="alert" className="error">{state.error}</p>}
    </section>
  );
}
