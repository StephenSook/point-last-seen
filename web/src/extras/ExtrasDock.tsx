import { useEffect, useId, useLayoutEffect, useRef, useState, type JSX, type RefObject } from "react";
import { flushSync } from "react-dom";
import { ExportButton } from "./export/ExportButton";
import { printableApproachLines, type IncidentView, type PlanDoc } from "./laneC";
import { Ics204 } from "./print/Ics204View";
import { defaultTyped, ics204Sheets } from "./print/ics204";
import { buildPrintModel, DRILL_LABEL, isStale, type PrintModel } from "./print/printModel";
import { ExtrasDialog, PrintRoot } from "./print/PrintRoot";
import { radioCards } from "./radio/radioCard";
import { RadioCards } from "./radio/RadioCards";
import { RadioCodeCheck } from "./radio/RadioCodeCheck";
import type { DockProps } from "./types";
import "./extras.css";

const assignmentTitle = "Print assignment sheet";
const cardsTitle = "Print radio cards";
const checkTitle = "Check a radio code";
const editFields = [
  ["dateFrom", "Date From", "mm/dd/yyyy"], ["dateTo", "Date To", "mm/dd/yyyy"],
  ["timeFrom", "Time From", "hh:mm"], ["timeTo", "Time To", "hh:mm"],
  ["branch", "Branch"], ["division", "Division"], ["group", "Group"], ["stagingArea", "Staging Area"],
] as const;

type PrintSessionData = { kind: "assignment" | "cards"; model: PrintModel; approachLines: string[] };
type Surface = PrintSessionData | { kind: "check"; planVersion: number | null };

function PrintSession({ session, plans, matchCode, reportCount, onClose, returnFocus }: {
  session: PrintSessionData;
  plans: readonly PlanDoc[];
  matchCode: string | null;
  reportCount: number;
  onClose: () => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
}) {
  const { model, approachLines, kind } = session;
  const [timeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [typed, setTyped] = useState(() => defaultTyped(model, timeZone));
  const [printedAtMs, setPrintedAtMs] = useState(model.printedAtMs);
  const drillLine = model.mode === "drill" ? DRILL_LABEL : null;
  useEffect(() => {
    const stamp = () => flushSync(() => setPrintedAtMs(Date.now()));
    window.addEventListener("beforeprint", stamp);
    return () => window.removeEventListener("beforeprint", stamp);
  }, []);

  let staleMessage: string | null = null;
  if (isStale(model, plans)) {
    const latest = Math.max(...plans.map(({ version }) => version).filter(Number.isInteger));
    staleMessage = `A newer plan (v${latest}) was approved. Print again.`;
  }
  if (kind === "cards") {
    // Q2 is open until the command report flow is available.
    const cards = radioCards(model, { sayLines: false });
    return (
      <PrintRoot title={cardsTitle} onClose={onClose} returnFocus={returnFocus} staleMessage={staleMessage} drillLine={drillLine}
        emptyMessage={cards.length === 0 ? "No teams to print." : undefined}>
        <RadioCards cards={cards} matchCode={matchCode} />
      </PrintRoot>
    );
  }

  const sheets = ics204Sheets({ ...model, matchCode, reportCount, printedAtMs }, typed, approachLines, timeZone);
  const controls = sheets.length === 0 ? undefined : (
    <>
      <div className="extras-edit-fields">
        {editFields.map(([key, label, placeholder]) => (
          <label key={key}>
            {label}
            <input value={typed[key]} placeholder={placeholder} onChange={(event) => {
              const value = event.target.value;
              setTyped((current) => ({ ...current, [key]: value }));
            }} />
          </label>
        ))}
      </div>
      <label className="extras-note-option">
        <input type="checkbox" checked={typed.includeApproachNotes} onChange={(event) => {
          const includeApproachNotes = event.target.checked;
          setTyped((current) => ({ ...current, includeApproachNotes }));
        }} />
        Include the approach notes
      </label>
    </>
  );

  return (
    <PrintRoot title={assignmentTitle} onClose={onClose} returnFocus={returnFocus} controls={controls} staleMessage={staleMessage} drillLine={drillLine}
      emptyMessage={sheets.length === 0 ? "No approved plan to print." : undefined}>
      {sheets.map((sheet) => <Ics204 key={sheet.page} sheet={sheet} />)}
    </PrintRoot>
  );
}

export function ExtrasDock({ incidentId, state, vs }: DockProps): JSX.Element | null {
  if (state.denied || state.view === null) return null;
  return <ActiveExtrasDock key={incidentId} view={state.view} state={state} vs={vs} />;
}

function ActiveExtrasDock({ view, state, vs }: Pick<DockProps, "state" | "vs"> & { view: IncidentView }) {
  const [open, setOpen] = useState(false);
  const [surface, setSurface] = useState<Surface | null>(null);
  const menuId = useId();
  const more = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const matchCode = vs?.code ?? null;
  const reportCount = new Set(state.events.map(({ eventId }) => eventId)).size;
  const snapshot = () => buildPrintModel({ view, plans: state.plans, code: matchCode, eventCount: reportCount, nowMs: Date.now() });

  function menuItems() {
    return Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not([disabled])') ?? []);
  }

  useLayoutEffect(() => {
    if (open) menu.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]')?.focus();
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
          <button type="button" role="menuitem" onClick={() => openPrint("assignment")}>{assignmentTitle}</button>
          <button type="button" role="menuitem" onClick={() => openPrint("cards")}>{cardsTitle}</button>
          <button type="button" role="menuitem" onClick={() => {
            setSurface({ kind: "check", planVersion: snapshot().planVersion });
            setOpen(false);
          }}>{checkTitle}</button>
          {open && <ExportButton view={view} plans={state.plans} vs={vs} reportCount={reportCount} onExported={closeMenu} />}
        </div>
      </div>
      {surface?.kind === "check" && (
        <ExtrasDialog title={checkTitle} onClose={closeDialog} returnFocus={more}>
          {view.incident?.mode === "drill" && <p className="extras-drill-line">{DRILL_LABEL}</p>}
          <RadioCodeCheck mine={matchCode} reportCount={reportCount} planVersion={surface.planVersion} />
          <div className="extras-dialog-actions"><button type="button" onClick={closeDialog}>Close</button></div>
        </ExtrasDialog>
      )}
      {surface && surface.kind !== "check" && (
        <PrintSession session={surface} plans={state.plans} matchCode={matchCode} reportCount={reportCount} onClose={closeDialog} returnFocus={more} />
      )}
    </>
  );
}
