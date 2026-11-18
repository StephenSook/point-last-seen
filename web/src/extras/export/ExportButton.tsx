import type { IncidentView, PlanDoc, ViewState } from "../laneC";
import { loadGeoJsonExport } from "../lazyPanels";
import { buildPrintModel } from "../print/printModel";

type Props = {
  view: IncidentView;
  plans: readonly PlanDoc[];
  vs: ViewState | null;
  reportCount: number;
  onExported: () => void;
  /** Called when the export fails. The dock shows it, because this item unmounts when the menu closes. */
  onError: () => void;
};

export function ExportButton({ view, plans, vs, reportCount, onExported, onError }: Props) {
  async function save() {
    if (vs === null) return;
    try {
      // Loaded on first use (and prefetched when the page is idle, so it also works with the link down).
      const { exportFileName, segmentsToGeoJson } = await loadGeoJsonExport();
      const nowMs = Date.now();
      const model = buildPrintModel({ view, plans, code: vs.code, eventCount: reportCount, nowMs });
      const json = segmentsToGeoJson({
        model, segments: view.segments, vs, rowPoa: vs.result.poa.ROW ?? 0, exportedAtMs: nowMs,
      });
      const file = new Blob([JSON.stringify(json)], { type: "application/geo+json" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(file);
      try {
        link.href = url;
        link.download = exportFileName(model.incidentName, model.planVersion, nowMs);
        document.body.append(link);
        link.click();
      } finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      onError();
      return;
    }
    onExported();
  }

  return (
    <button type="button" role="menuitem" disabled={vs === null} onClick={() => void save()} title="GeoJSON (RFC 7946)">
      Export GeoJSON{vs === null && <small>Build the prior first.</small>}
    </button>
  );
}
