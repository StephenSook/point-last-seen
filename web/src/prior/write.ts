// Writes a rebuilt prior in one batch: every segment, ROW and the incident, so no seat
// sees a mix of old and new. The promise settles on the server's acknowledgement and
// is never awaited for screen state (the local snapshot has the new prior at once).

import { doc, writeBatch, type Firestore } from "firebase/firestore";
import type { PriorWrites } from "./rebuild";

export function writePrior(db: Firestore, incidentId: string, w: PriorWrites): Promise<void> {
  const batch = writeBatch(db);
  for (const s of w.segments) batch.set(doc(db, "incidents", incidentId, "segments", s.segmentId), s.data, { merge: true });
  batch.set(doc(db, "incidents", incidentId, "segments", "ROW"), w.row, { merge: true });
  batch.update(doc(db, "incidents", incidentId), w.incident);
  return batch.commit();
}
