import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { compareCodePoints } from "./compare";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Each field: a 4-byte big-endian byte length, then its UTF-8 bytes. Fields are never joined by a separator. */
function frame(fields: string[]): Uint8Array {
  const parts = fields.map(f => utf8ToBytes(f));
  const out = new Uint8Array(parts.reduce((n, p) => n + 4 + p.length, 0));
  let o = 0;
  for (const p of parts) {
    new DataView(out.buffer).setUint32(o, p.length, false);
    out.set(p, o + 4);
    o += 4 + p.length;
  }
  return out;
}

/** First 16 bytes of SHA-256 over incidentId, deviceId and decimal seq, as 32 lowercase hex characters. */
export function eventId(incidentId: string, deviceId: string, seq: number): string {
  return bytesToHex(sha256(frame([incidentId, deviceId, String(seq)]))).slice(0, 32);
}

/** SHA-256 over [decimal priorVersion] + the deduplicated ids in code-point order; 64 lowercase hex. */
export function eventSetHash(priorVersion: number, eventIds: string[]): string {
  const ids = [...new Set(eventIds)].sort(compareCodePoints);
  return bytesToHex(sha256(frame([String(priorVersion), ...ids])));
}

/** The first 20 bits of the hash as 4 Crockford base-32 characters, most significant first. */
export function convergenceCode(hash: string): string {
  const bits = Number.parseInt(hash.slice(0, 5), 16);
  return [15, 10, 5, 0].map(shift => CROCKFORD[(bits >> shift) & 31]).join("");
}
