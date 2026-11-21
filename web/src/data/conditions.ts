// The incident's typed conditions (shared/schemas/incident-conditions.schema.json): the air temperature and whether
// the person is likely wet, typed by command. The phones turn them into the urgency chip with the shared rule
// (shared/constants/urgency.json, urgencyFromConditions); the command post shows the same chip and its source.
import { urgencyFromConditions, type IncidentConditions } from "@pls/engine";
import { doc, updateDoc, type Firestore } from "firebase/firestore";
import urgency from "../../../shared/constants/urgency.json";

// The rules' range (firestore.rules, schema_IncidentConditions).
const MIN_F = -80;
const MAX_F = 140;
const TEMPERATURE = /^-?\d+(\.\d+)?$/;

/** The iPhone's source line for the chip (PLSCore UrgencyRule.sourceLine), from the same file. */
export const URGENCY_SOURCE_LINE = `CDC: "${urgency.quote}" (read ${urgency.readOn})`;
export const URGENCY_SOURCE_URL = urgency.sourceUrl;
const CHIP = { cold: "Cold raises urgency", cool_wet: "Cool and wet raises urgency" } as const;

export type ConditionsInput = { ok: true; conditions: IncidentConditions } | { ok: false; message: string };

/** What command typed: an empty temperature is not known; anything else must be a plain number in the rules' range. */
export function parseConditions(tempText: string, wet: boolean | null, atMs: number): ConditionsInput {
  const t = tempText.trim();
  if (t === "") return { ok: true, conditions: { tempF: null, wet, setAtMs: atMs } };
  const n = Number(t);
  if (!TEMPERATURE.test(t) || n < MIN_F || n > MAX_F) return { ok: false, message: "Type the temperature as a number from -80 to 140." };
  return { ok: true, conditions: { tempF: n, wet, setAtMs: atMs } };
}

/** The incident's conditions, or null when there are none or they do not have the shared shape. */
export function conditionsOf(incident: unknown): IncidentConditions | null {
  const c = typeof incident === "object" && incident !== null ? (incident as { conditions?: unknown }).conditions : undefined;
  if (typeof c !== "object" || c === null) return null;
  const { tempF, wet, setAtMs } = c as Record<string, unknown>;
  if (!(tempF === null || typeof tempF === "number") || !(wet === null || typeof wet === "boolean") || typeof setAtMs !== "number") return null;
  return { tempF, wet, setAtMs };
}

/** The chip the phones show for these conditions, in the iPhone's words, or null for none. */
export function urgencyChip(c: IncidentConditions | null): string | null {
  const level = urgencyFromConditions(c);
  return level === "none" ? null : CHIP[level];
}

export async function setConditions(db: Firestore, incidentId: string, conditions: IncidentConditions): Promise<void> {
  await updateDoc(doc(db, "incidents", incidentId), { conditions });
}
