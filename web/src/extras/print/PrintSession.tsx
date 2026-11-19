import { useEffect, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import type { PlanDoc } from "../hostApp";
import { radioCards } from "../radio/radioCard";
import { RadioCards } from "../radio/RadioCards";
import { Ics204 } from "./Ics204View";
import { defaultTyped, ics204Sheets } from "./ics204";
import { isStale, type PrintModel } from "./printModel";
import { PrintRoot } from "./PrintRoot";

export const assignmentTitle = "Print assignment sheet";
export const cardsTitle = "Print radio cards";
/** One box, on the sheet and on the cards, says plainly what ticking it puts on paper. */
export const personBoxLabel = "Print the person's names and approach notes (teams need them in the field; paper leaves this app)";
const editFields = [
  ["dateFrom", "Date From", "mm/dd/yyyy"], ["dateTo", "Date To", "mm/dd/yyyy"],
  ["timeFrom", "Time From", "hh:mm"], ["timeTo", "Time To", "hh:mm"],
  ["branch", "Branch"], ["division", "Division"], ["group", "Group"], ["stagingArea", "Staging Area"],
] as const;

export type PrintSessionData = { kind: "assignment" | "cards"; model: PrintModel; approachLines: string[] };

export function PrintSession({ session, plans, matchCode, reportCount, onClose, returnFocus }: {
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
  const [cardsPerson, setCardsPerson] = useState(false);
  const drillLine = model.drillLabel;
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
    // The say-it-like-this lines wait for a command report flow; the person lines print only when ticked.
    const cards = radioCards(model, { sayLines: false, personLines: cardsPerson ? approachLines : [] });
    const cardControls = cards.length === 0 ? undefined : (
      <label className="extras-note-option">
        <input type="checkbox" checked={cardsPerson} onChange={(event) => setCardsPerson(event.target.checked)} />
        {personBoxLabel}
      </label>
    );
    return (
      <PrintRoot title={cardsTitle} onClose={onClose} returnFocus={returnFocus} controls={cardControls} staleMessage={staleMessage} drillLine={drillLine}
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
        {personBoxLabel}
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
