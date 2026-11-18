import type { ReactNode } from "react";
import { ICS204_BLOCK_TITLES, ICS204_EDITION, ICS204_RESOURCE_COLUMNS, ICS204_ROWS_PER_SHEET, type Ics204Sheet } from "./ics204";

const roles = ["Operations Section Chief", "Branch Director", "Division/Group Supervisor"];

function Block({ index, children }: { index: number; children: ReactNode }) {
  return (
    <section data-block={index}>
      <h3>{index}. {ICS204_BLOCK_TITLES[index - 1]}</h3>
      {children}
    </section>
  );
}

function FormFields({ fields }: { fields: readonly (readonly [string, string])[] }) {
  return (
    <dl className="extras-ics-fields">
      {fields.map(([label, value]) => (
        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
      ))}
    </dl>
  );
}

function Lines({ lines }: { lines: string[] }) {
  if (lines.length === 0) return <div className="extras-ics-lines" />;
  return <div className="extras-ics-lines">{lines.map((line, index) => <p key={index}>{line}</p>)}</div>;
}

export function Ics204({ sheet }: { sheet: Ics204Sheet }) {
  const { period, unit, resources } = sheet;
  return (
    <article className="extras-ics-sheet" aria-label={`Assignment sheet ${sheet.page} of ${sheet.pages}`}>
      <h2>Assignment List (ICS 204)</h2>
      <div className="extras-ics-top">
        <Block index={1}><p>{sheet.incidentName}</p></Block>
        <Block index={2}>
          <FormFields fields={[
            ["Date From", period.dateFrom], ["Date To", period.dateTo], ["Time From", period.timeFrom], ["Time To", period.timeTo],
          ]} />
        </Block>
      </div>
      <Block index={3}>
        <FormFields fields={[["Branch", unit.branch], ["Division", unit.division], ["Group", unit.group], ["Staging Area", unit.stagingArea]]} />
      </Block>
      <Block index={4}>
        <table>
          <thead><tr><td /><th scope="col">Name</th><th scope="col">Contact Number(s)</th></tr></thead>
          <tbody>{roles.map((role) => <tr key={role}><th scope="row">{role}</th><td /><td /></tr>)}</tbody>
        </table>
      </Block>
      <Block index={5}>
        <table className="extras-ics-resources">
          <thead><tr>{ICS204_RESOURCE_COLUMNS.map((column) => <th scope="col" key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {Array.from({ length: ICS204_ROWS_PER_SHEET }, (_, index) => {
              const row = resources[index];
              return (
                <tr key={index}>
                  <td>{row?.resourceIdentifier}</td><td>{row?.leader}</td><td>{row?.persons}</td><td>{row?.contact}</td><td>{row?.notes}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Block>
      <Block index={6}><Lines lines={sheet.workAssignments} /></Block>
      <Block index={7}><Lines lines={sheet.specialInstructions} /></Block>
      <Block index={8}>
        <table>
          <thead>
            <tr><th scope="col">Name/Function</th><th scope="col">Primary Contact: indicate cell, pager, or radio (frequency/system/channel)</th></tr>
          </thead>
          <tbody>{Array.from({ length: 4 }, (_, index) => <tr key={index}><td /><td /></tr>)}</tbody>
        </table>
      </Block>
      <Block index={9}><FormFields fields={[["Name", ""], ["Position/Title", ""], ["Signature", ""]]} /></Block>
      <footer>
        <div className="extras-ics-footer"><strong>ICS 204</strong> <span>IAP Page {sheet.page} of {sheet.pages}</span> <span>Date/Time {sheet.preparedDateTime}</span></div>
        <p>Layout follows FEMA ICS Form 204 ({ICS204_EDITION}). Printed by Point Last Seen.</p>
      </footer>
    </article>
  );
}
