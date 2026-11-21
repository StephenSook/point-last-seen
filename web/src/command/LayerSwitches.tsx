// The prior's layers (spec 10.5): rings always, the near-roads-and-water layer and the
// direction wedge as switches, and the distance table column. Each shows its source and
// n. A change rebuilds the prior for every team (the match code changes), so it asks first.

import { ELEVATION_PARAMS, type PriorLayers, type Terrain } from "@pls/engine";
import { useEffect, useRef, useState } from "react";
import { priorRefusalMessage } from "./postAccess";
import { ringSourceLine, TERRAINS } from "./terrains";

type Props = {
  layers: PriorLayers;
  terrain: Terrain;
  /** The incident's stored ring radii for this terrain (km); the source line names them when they differ from ISRID's. */
  rings?: unknown;
  /** The incident's own note on its terrain column (written by the seed, e.g. a default not verified for the site). */
  terrainNote?: unknown;
  /** A confirmed direction of travel exists (the wedge needs one). */
  hasBearing: boolean;
  /**
   * The site's elevation file loaded (the switch shows only then) and whether the start point's segment has an
   * elevation (the layer measures from it).
   */
  elevation?: { available: boolean; startHasElevation: boolean };
  vehicleInvolved: boolean;
  /** The prior model in use; a layer rebuild always gives the ring prior. */
  model?: "rings" | "walkers";
  /** Starts the rebuild and returns at once; `ack` settles when the server has it. */
  onApply: (layers: PriorLayers, terrain: Terrain) => { version: number; ack: Promise<void> };
};

export function LayerSwitches({ layers, terrain, rings, terrainNote, hasBearing, elevation, vehicleInvolved, model = "rings", onApply }: Props) {
  const note = typeof terrainNote === "string" ? terrainNote.trim().slice(0, 200) : "";
  const [draft, setDraft] = useState({ layers, terrain });
  const [sent, setSent] = useState<number | null>(null);
  // The version the server acknowledged; a queued local write moves the local version at once.
  const [acked, setAcked] = useState<number | null>(null);
  // Each rebuild's result applies only while it is the latest one sent.
  const latest = useRef(0);
  const [error, setError] = useState<string | null>(null);
  // Follow the stored settings when they change (another seat, or this rebuild arriving).
  useEffect(() => setDraft({ layers, terrain }), [layers.linear, layers.wedge, layers.elevation, terrain]);

  const changed = draft.layers.linear !== layers.linear || draft.layers.wedge !== layers.wedge
    || (draft.layers.elevation ?? false) !== (layers.elevation ?? false) || draft.terrain !== terrain;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  // The switch shows where the site's elevation file loaded, and wherever the saved layer is on, so command can always
  // turn a saved layer off; it turns on only where the engine can measure the start.
  const showElevation = elevation?.available === true || layers.elevation === true;
  const canTurnOnElevation = elevation?.available === true && elevation.startHasElevation && draft.terrain !== "urban";
  const elevationWhyNot = !elevation?.available ? " This site's elevation file did not load; you can turn the layer off."
    : draft.terrain === "urban" ? " Not used on urban terrain: the source has no urban split."
    : !elevation.startHasElevation ? " Needs the start point inside a mapped segment that has an elevation." : "";

  function apply() {
    setError(null);
    try {
      const { version, ack } = onApply(draft.layers, draft.terrain);
      const id = ++latest.current;
      setSent(version);
      ack.then(
        () => id === latest.current && setAcked(version),
        (e: unknown) => {
          if (id !== latest.current) return;
          setSent(null);
          setError(priorRefusalMessage(e));
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "The prior was not rebuilt.");
    }
  }

  return (
    <section aria-labelledby="prior-h" className="layers">
      <h2 id="prior-h" className="label">Prior</h2>
      <div className="layer">
        <p>Rings, always on</p>
        <p className="muted small">{ringSourceLine(terrain, rings)}</p>
        {note && (
          <p className="muted small" data-testid="terrain-note">
            {note}
          </p>
        )}
        <label>
          Distance table
          <select
            value={draft.terrain}
            onChange={(e) => {
              const next = e.target.value as Terrain;
              // The elevation layer has no urban split, so choosing the urban table turns it off.
              setDraft((d) => ({ terrain: next, layers: next === "urban" ? { ...d.layers, elevation: false } : d.layers }));
            }}
          >
            {TERRAINS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="layer">
        <label className="check">
          <input
            type="checkbox"
            role="switch"
            checked={draft.layers.linear}
            onChange={(e) => setDraft((d) => ({ ...d, layers: { ...d.layers, linear: e.target.checked } }))}
          />
          Near roads, trails and water
        </label>
        <p className="muted small">
          ISRID: 75% of found subjects within 71 m of a road, trail, stream or water edge, n = 110. Neutral when 75% or more of this grid's mass is already that close (our rule, not ISRID's).
        </p>
      </div>
      <div className="layer">
        <label className="check">
          <input
            type="checkbox"
            role="switch"
            checked={draft.layers.wedge}
            disabled={!hasBearing}
            onChange={(e) => setDraft((d) => ({ ...d, layers: { ...d.layers, wedge: e.target.checked } }))}
          />
          Direction of travel
        </label>
        <p className="muted small">ISRID: 75% within 66 degrees of the travel direction, n = 11.{hasBearing ? "" : " Needs a confirmed direction of travel."}</p>
      </div>
      {showElevation && (
        <div className="layer">
          <label className="check">
            <input
              type="checkbox"
              role="switch"
              checked={draft.layers.elevation ?? false}
              disabled={!(draft.layers.elevation ?? false) && !canTurnOnElevation}
              onChange={(e) => setDraft((d) => ({ ...d, layers: { ...d.layers, elevation: e.target.checked } }))}
            />
            Downhill and level ground
          </label>
          <p className="muted small">
            ISRID dementia, temperate (Lost Person Behavior p. 164): found {pct(ELEVATION_PARAMS.temperate.down)} downhill,{" "}
            {pct(ELEVATION_PARAMS.temperate.level)} about level and {pct(ELEVATION_PARAMS.temperate.up)} uphill of the point last
            seen; no n printed. About level means within {ELEVATION_PARAMS.levelBandM} m of the start segment (our rule; the
            source gives none).{elevationWhyNot}
          </p>
        </div>
      )}
      {vehicleInvolved && <p>Vehicle involved: these distances assume travel on foot.</p>}
      {changed && (
        <div className="suggested">
          <p>{model === "walkers" ? "Rebuild the prior as rings?" : "Rebuild the prior?"} Every team's map and match code change.</p>
          <div className="row">
            <button type="button" className="btn" onClick={apply}>
              Rebuild prior
            </button>
            <button type="button" className="btn ghost" onClick={() => setDraft({ layers, terrain })}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {sent !== null && (
        <p role="status">{acked === sent ? `Prior rebuilt as v${sent}.` : `Prior rebuilt on this laptop as v${sent}. Sending.`}</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
