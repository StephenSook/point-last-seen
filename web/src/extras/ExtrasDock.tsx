import { Suspense, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type JSX } from "react";
import { ExportButton } from "./export/ExportButton";
import { printableApproachLines, type IncidentView } from "./laneC";
import { LazyPrintSession, LazyRadioCodeCheck, LazyReplayPanel, prefetchDockPanels } from "./lazyPanels";
import type { PrintSessionData } from "./print/PrintSession";
import { buildPrintModel, DRILL_LABEL } from "./print/printModel";
import { ExtrasDialog } from "./print/PrintRoot";
import { fromLive } from "./replay/replayData";
import { TerrainLegend } from "./terrain/TerrainLegend";
import { fetchElevation, useTerrain } from "./terrain/useTerrain";
import type { DockProps } from "./types";
import "./extras.css";

const replayTitle = "Replay";
const assignmentTitle = "Print assignment sheet";
const cardsTitle = "Print radio cards";
const checkTitle = "Check a radio code";

type Surface = PrintSessionData | { kind: "check"; planVersion: number | null } | { kind: "replay" };

export function ExtrasDock({ incidentId, state, vs, map, loadElevation = fetchElevation }: DockProps): JSX.Element | null {
  if (state.denied || state.view === null) return null;
  return <ActiveExtrasDock key={incidentId} view={state.view} state={state} vs={vs} map={map} loadElevation={loadElevation} />;
}

function ActiveExtrasDock({ view, state, vs, map, loadElevation }: Pick<DockProps, "state" | "vs" | "map"> & {
  view: IncidentView;
  loadElevation: (gridId: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [surface, setSurface] = useState<Surface | null>(null);
  const menuId = useId();
  const more = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const matchCode = vs?.code ?? null;
  const reportCount = new Set(state.events.map(({ eventId }) => eventId)).size;
  // The replay follows the live state while it is open: a report that lands extends the window.
  const replayData = useMemo(() => fromLive(view, state.events, state.plans), [view, state.events, state.plans]);
  const terrain = useTerrain(view, map, loadElevation);
  useEffect(() => prefetchDockPanels(), []);
  const snapshot = () => buildPrintModel({ view, plans: state.plans, code: matchCode, eventCount: reportCount, nowMs: Date.now() });

  function menuItems() {
    return Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button[role^="menuitem"]:not([disabled])') ?? []);
  }

  useLayoutEffect(() => {
    if (open) menu.current?.querySelector<HTMLButtonElement>('button[role^="menuitem"]:not([disabled])')?.focus();
  }, [open]);

  function openPrint(kind: PrintSessionData["kind"]) {
    const ids = state.profile?.shared?.approachNoteIds;
    setSurface({ kind, model: snapshot(), approachLines: kind === "assignment" && Array.isArray(ids) ? printableApproachLines(ids) : [] });
    setOpen(false);
  }

  function closeMenu() {
    setOpen(false);
    more.current?.focus();
  }

  function closeDialog() {
    setSurface(null);
  }

  return (
    <>
      <div
        className="extras-dock"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }}
        onKeyDown={(event) => {
          if (open && event.key === "Escape") {
            event.preventDefault();
            closeMenu();
          }
          if (!open || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          const items = menuItems();
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          const offset = event.key === "ArrowUp" ? -1 : 1;
          const next = event.key === "Home" ? items[0] : event.key === "End" ? items.at(-1)
            : items[(index + offset + items.length) % items.length];
          event.preventDefault();
          next?.focus();
        }}
      >
        <button ref={more} className="btn ghost" type="button" aria-haspopup="menu" aria-expanded={open}
          aria-controls={menuId} onClick={() => setOpen(!open)}
          onKeyDown={(event) => {
            if (!open && event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
            }
          }}>
          More
        </button>
        <div id={menuId} ref={menu} className="extras-menu" role="menu" aria-label="More" hidden={!open}>
          <button type="button" role="menuitem" disabled={replayData === null} onClick={() => {
            setSurface({ kind: "replay" });
            setOpen(false);
          }}>
            {replayTitle}
            {replayData === null && <small>Available once the prior is built.</small>}
          </button>
          <button type="button" role="menuitem" onClick={() => openPrint("assignment")}>{assignmentTitle}</button>
          <button type="button" role="menuitem" onClick={() => openPrint("cards")}>{cardsTitle}</button>
          <button type="button" role="menuitem" onClick={() => {
            setSurface({ kind: "check", planVersion: snapshot().planVersion });
            setOpen(false);
          }}>{checkTitle}</button>
          {open && <ExportButton view={view} plans={state.plans} vs={vs} reportCount={reportCount} onExported={closeMenu} />}
          <button type="button" role="menuitemcheckbox" aria-checked={terrain.on} disabled={!terrain.available} onClick={() => {
            terrain.toggle();
            setOpen(false);
          }}>
            Terrain
            {!terrain.available && <small>Not available for this map.</small>}
          </button>
        </div>
      </div>
      {terrain.on && terrain.file && <TerrainLegend classes={terrain.classes} file={terrain.file} hasStart={terrain.hasStart} />}
      {surface?.kind === "check" && (
        <ExtrasDialog title={checkTitle} onClose={closeDialog} returnFocus={more}>
          {view.incident?.mode === "drill" && <p className="extras-drill-line">{DRILL_LABEL}</p>}
          <Suspense fallback={<p>Loading.</p>}>
            <LazyRadioCodeCheck mine={matchCode} reportCount={reportCount} planVersion={surface.planVersion} />
          </Suspense>
          <div className="extras-dialog-actions"><button type="button" onClick={closeDialog}>Close</button></div>
        </ExtrasDialog>
      )}
      {surface?.kind === "replay" && replayData && (
        <ExtrasDialog title={replayTitle} onClose={closeDialog} returnFocus={more} className="extras-replay-dialog">
          <Suspense fallback={<p>Loading.</p>}>
            <LazyReplayPanel data={replayData} />
          </Suspense>
          <div className="extras-dialog-actions"><button type="button" onClick={closeDialog}>Close</button></div>
        </ExtrasDialog>
      )}
      {surface && surface.kind !== "check" && surface.kind !== "replay" && (
        <Suspense fallback={null}>
          <LazyPrintSession session={surface} plans={state.plans} matchCode={matchCode} reportCount={reportCount} onClose={closeDialog} returnFocus={more} />
        </Suspense>
      )}
    </>
  );
}
