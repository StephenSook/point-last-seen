// Reads one incident through the Firestore REST API with the gcloud user's token (admin tool; rules do not apply).
import { execFileSync } from "node:child_process";
import type { Doc, RawRun } from "./transform";

type Value = Record<string, unknown>;

function fromValue(v: Value): unknown {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return Date.parse(String(v.timestampValue));
  if ("arrayValue" in v) return (((v.arrayValue as { values?: Value[] }).values) ?? []).map(fromValue);
  if ("mapValue" in v) return fromFields(((v.mapValue as { fields?: Record<string, Value> }).fields) ?? {});
  throw new Error(`unsupported Firestore value: ${Object.keys(v).join(", ")}`);
}

/** A document's fields as plain values; timestamps become milliseconds. */
export function fromFields(fields: Record<string, Value>): Doc {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromValue(v)]));
}

/** Events in server-time order, then by id, so pseudonyms and the file are the same on every export. */
export function sortEvents(events: Doc[]): Doc[] {
  return [...events].sort((a, b) => Number(a.serverTime) - Number(b.serverTime) || String(a.eventId).localeCompare(String(b.eventId)));
}

const byId = (key: string) => (a: Doc, b: Doc) => String(a[key]).localeCompare(String(b[key]));

export async function readIncident(project: string, incidentId: string): Promise<RawRun> {
  const token = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim();
  const root = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
  const headers = { Authorization: `Bearer ${token}`, "x-goog-user-project": project };
  const idOf = (name: string) => name.slice(name.lastIndexOf("/") + 1);
  async function get(path: string): Promise<Doc> {
    const r = await fetch(`${root}/${path}`, { headers });
    if (!r.ok) throw new Error(`GET ${path}: HTTP ${r.status}`);
    return fromFields(((await r.json()) as { fields?: Record<string, Value> }).fields ?? {});
  }
  async function list(path: string): Promise<{ id: string; data: Doc }[]> {
    const out: { id: string; data: Doc }[] = [];
    let page = "";
    do {
      const r = await fetch(`${root}/${path}?pageSize=300${page ? `&pageToken=${page}` : ""}`, { headers });
      if (!r.ok) throw new Error(`LIST ${path}: HTTP ${r.status}`);
      const body = (await r.json()) as { documents?: { name: string; fields?: Record<string, Value> }[]; nextPageToken?: string };
      for (const d of body.documents ?? []) out.push({ id: idOf(d.name), data: fromFields(d.fields ?? {}) });
      page = body.nextPageToken ?? "";
    } while (page);
    return out;
  }
  const base = `incidents/${incidentId}`;
  const incident = await get(base);
  const segments = (await list(`${base}/segments`)).map(d => ({ ...d.data, segmentId: d.id }))
    .sort((a, b) => (a.segmentId === "ROW" ? 1 : b.segmentId === "ROW" ? -1 : byId("segmentId")(a, b)));
  const teams = (await list(`${base}/teams`)).map(d => ({ ...d.data, teamId: d.id })).sort(byId("teamId"));
  const devices: Doc[] = [], measurements: Doc[] = [];
  for (const t of teams) {
    for (const d of (await list(`${base}/teams/${t.teamId}/devices`)).sort((a, b) => a.id.localeCompare(b.id))) {
      devices.push({ ...d.data, teamId: t.teamId, deviceId: d.id });
      for (const m of await list(`${base}/teams/${t.teamId}/devices/${d.id}/measurements`)) {
        measurements.push({ ...m.data, teamId: t.teamId, deviceId: d.id, eventId: m.id });
      }
    }
  }
  const events = sortEvents((await list(`${base}/events`)).map(d => ({ ...d.data, eventId: d.id })));
  const plans = (await list(`${base}/plans`)).map(d => d.data).sort((a, b) => Number(a.version) - Number(b.version));
  return { incidentId, incident, segments, teams, devices, measurements, events, plans };
}
