// The command post's cloud read of one stored photo, and every check before it. The family's consent record is
// named by the photo's SHA-256, and the tray takes that hash from the Storage file name, so the bytes about to
// be sent are hashed first and must match it. Then the family's consent (read from the server), then the file
// still in Storage. Only then is the model called.

import { readPhotoInCloud } from "../ai/photoCues";
import { bytesToBase64, sha256Hex, type PhotoConsent } from "../data/photos";

type Reply = { text: string; inferenceSource: string | undefined };

export type CloudReadDeps = {
  /** The family's consent for the photo with this hash, from the server; rejects when it cannot be read. */
  confirmConsent: (sha256: string) => Promise<PhotoConsent | null>;
  /** Whether the photo with this hash is still in Storage; rejects when the check cannot run. */
  stillStored: (sha256: string) => Promise<boolean>;
  generateCloud: (jpegBase64: string) => Promise<Reply>;
  killCloud: boolean;
};

export type CloudReadRefusal = "mismatch" | "no-consent" | "consent-unchecked" | "deleted";

export async function readStoredPhotoInCloud(photo: { sha256: string; bytes: Uint8Array }, deps: CloudReadDeps) {
  // These exact bytes, or nothing: a file whose content does not match its name is not this photo.
  if ((await sha256Hex(photo.bytes)) !== photo.sha256) return { refused: "mismatch" as const };
  let consent: PhotoConsent | null;
  try {
    consent = await deps.confirmConsent(photo.sha256);
  } catch {
    return { refused: "consent-unchecked" as const };
  }
  if (!consent) return { refused: "no-consent" as const };
  // Command may have deleted this search's media from any seat; a check that cannot run throws.
  if (!(await deps.stillStored(photo.sha256))) return { refused: "deleted" as const };
  return readPhotoInCloud(bytesToBase64(photo.bytes), consent, { generateCloud: deps.generateCloud, killCloud: deps.killCloud });
}
