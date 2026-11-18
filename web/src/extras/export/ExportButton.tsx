import { useState } from "react";
import type { IncidentView, PlanDoc, ViewState } from "../laneC";
import { buildPrintModel } from "../print/printModel";
import { exportFileName, segmentsToGeoJson } from "./geojsonExport";

type Props = {
  view: IncidentView;
  plans: readonly PlanDoc[];
  vs: ViewState | null;
  reportCount: number;
  onExported: () => void;
};

export function ExportButton({ view, plans, vs, reportCount, onExported }: Props) {
  const [error, setError] = useState(false);

  function save() {
    if (vs === null) return;
    setError(false);
    try {
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
      setError(true);
      return;
    }
    onExported();
  }

  return (
    <>
      <button type="button" role="menuitem" disabled={vs === null} onClick={save} title="GeoJSON (RFC 7946)">
        Export GeoJSON{vs === null && <small>Build the prior first.</small>}
      </button>
      {error && <p role="alert">GeoJSON could not be exported.</p>}
    </>
  );
}
