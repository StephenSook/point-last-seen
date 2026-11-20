/**
 * The published run's own label, as shown above the judge replay. The replay prints the drill line itself, so the
 * label drops it: the line is on screen once. A label that is only the drill line, or empty, shows nothing.
 */
export function runLabelLine(label: unknown, drillLabel: string | null): string | null {
  if (typeof label !== "string") return null;
  let text = label;
  if (drillLabel) text = text.split(drillLabel).join(" ");
  text = text.replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}
