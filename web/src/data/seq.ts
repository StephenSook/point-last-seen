// Sequence numbers for events written by this browser. The event id hashes
// (incident, uid, seq), so a seq must never repeat for one uid: it starts from
// the clock in milliseconds and only moves forward.

export function makeSeq(now: () => number = Date.now): () => number {
  let last = 0;
  return () => {
    last = Math.max(Math.floor(now()), last + 1);
    return last;
  };
}
