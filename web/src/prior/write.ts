// Writes a rebuilt prior in one batch: every segment, ROW and the incident, so no seat
// sees a mix of old and new. Events that belong with it (a confirmed camera sighting and its
// confirmation) go in the same batch, so the server takes all of them or none. The promise
// settles on the server's acknowledgement and is never awaited for screen state (the local
// snapshot has the new prior at once).

import type { EventDoc } from "@pls/engine";
import { doc, serverTimestamp, writeBatch, type Firestore } from "firebase/firestore";
import type { PriorWrites } from "./rebuild";
import type { WalkerPriorWrites } from "./walkerPrior";

export type BatchOp = { kind: "set" | "update" | "create"; path: string; data: object };

export function priorBatchOps(incidentId: string, w: PriorWrites | WalkerPriorWrites, events: readonly EventDoc[] = []): BatchOp[] {
  const inc = `incidents/${incidentId}`;
  return [
    ...w.segments.map((s) => ({ kind: "set" as const, path: `${inc}/segments/${s.segmentId}`, data: s.data })),
    { kind: "set", path: `${inc}/segments/ROW`, data: w.row },
    { kind: "update", path: inc, data: w.incident },
    // Events are create-only: a set of a new document is a create under the rules, and the rules
    // refuse it (and so the whole batch) if the id already exists.
    ...events.map((e) => ({ kind: "create" as const, path: `${inc}/events/${e.eventId}`, data: { ...e, serverTime: serverTimestamp() } })),
  ];
}

export function writePrior(db: Firestore, incidentId: string, w: PriorWrites | WalkerPriorWrites, events: readonly EventDoc[] = []): Promise<void> {
  const batch = writeBatch(db);
  for (const op of priorBatchOps(incidentId, w, events)) {
    const ref = doc(db, op.path);
    if (op.kind === "update") batch.update(ref, op.data as Record<string, unknown>);
    else if (op.kind === "set") batch.set(ref, op.data, { merge: true });
    else batch.set(ref, op.data);
  }
  return batch.commit();
}
