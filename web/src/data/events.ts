// Append-only event writes and the live event stream for one incident.
//
// A write is never awaited by the caller. Its completion decides the entry's
// state. A failed write is never shown as rejected until a server read says
// the document is absent: a write can land and still report an error, and the
// rules deny an identical second write, so a retry must read first.

import {
  collection,
  doc as docRef,
  getDocFromServer,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";

export type WriteState = "pending" | "checking" | "acked" | "rejected";
export type ServerCopy = "same" | "absent" | "different" | "offline";

export type EventIdentity = {
  eventId: string;
  incidentId: string;
  deviceId: string;
  seq: number;
  authorUid: string;
  clientTimeMs: number;
};

export function classifyWriteFailure(_error: string, serverCopy: ServerCopy): "acked" | "rejected" | "checking" {
  switch (serverCopy) {
    case "same":
      return "acked";
    case "offline":
      return "checking";
    case "absent":
    case "different":
      return "rejected";
  }
}

export function compareServerCopy(local: EventIdentity, server: Partial<EventIdentity> | undefined): ServerCopy {
  if (server === undefined) return "absent";
  const same =
    server.deviceId === local.deviceId &&
    server.seq === local.seq &&
    server.authorUid === local.authorUid &&
    server.clientTimeMs === local.clientTimeMs;
  return same ? "same" : "different";
}

export type WriteDeps = {
  write: (doc: EventIdentity) => Promise<void>;
  readFromServer: (doc: EventIdentity) => Promise<Partial<EventIdentity> | undefined>;
  onState: (eventId: string, state: WriteState) => void;
};

function errorCode(e: unknown): string {
  return typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "unknown";
}

async function readBack(doc: EventIdentity, error: string, deps: WriteDeps): Promise<void> {
  deps.onState(doc.eventId, "checking");
  let copy: ServerCopy;
  try {
    copy = compareServerCopy(doc, await deps.readFromServer(doc));
  } catch {
    copy = "offline";
  }
  const state = classifyWriteFailure(error, copy);
  if (state !== "checking") deps.onState(doc.eventId, state);
}

/** Starts the write and returns at once. States arrive through `deps.onState`. */
export function appendEventWith(doc: EventIdentity, deps: WriteDeps): void {
  deps.onState(doc.eventId, "pending");
  deps.write(doc).then(
    () => deps.onState(doc.eventId, "acked"),
    (e: unknown) => readBack(doc, errorCode(e), deps),
  );
}

/** A retry reads first, so it never rewrites a document that exists. */
export function retryEventWith(doc: EventIdentity, deps: WriteDeps): void {
  deps.onState(doc.eventId, "checking");
  deps.readFromServer(doc).then(
    (server) => {
      const copy = compareServerCopy(doc, server);
      if (copy === "absent") appendEventWith(doc, deps);
      else deps.onState(doc.eventId, copy === "same" ? "acked" : "rejected");
    },
    () => undefined, // still offline: the entry stays checking
  );
}

export function firestoreWriteDeps(db: Firestore, onState: WriteDeps["onState"]): WriteDeps {
  const ref = (d: EventIdentity) => docRef(db, "incidents", d.incidentId, "events", d.eventId);
  return {
    write: (d) => setDoc(ref(d), { ...d, serverTime: serverTimestamp() }),
    readFromServer: async (d) => {
      const snap = await getDocFromServer(ref(d));
      return snap.exists() ? (snap.data() as Partial<EventIdentity>) : undefined;
    },
    onState,
  };
}

export type StreamedEvent = Record<string, unknown> & { eventId: string; serverTimeMs: number | null; pendingWrite: boolean };

/** Live events for an incident, with each event's server time and pending flag. */
export function subscribeEvents(
  db: Firestore,
  incidentId: string,
  cb: (events: StreamedEvent[], fromCache: boolean) => void,
  onError: (e: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, "incidents", incidentId, "events"),
    { includeMetadataChanges: true },
    (snap) => {
      cb(
        snap.docs.map((d) => {
          const data = d.data();
          const st = data["serverTime"] as { toMillis?: () => number } | null | undefined;
          return { ...data, eventId: d.id, serverTimeMs: st?.toMillis ? st.toMillis() : null, pendingWrite: d.metadata.hasPendingWrites };
        }),
        // True while the answer comes from the local cache; the post plays no beat until the server has answered.
        snap.metadata.fromCache,
      );
    },
    onError,
  );
}
