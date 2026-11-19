// The command post's photo tray state. Photos come from Storage, which no seat can listen to, so a delete
// reaches every seat through the incident's mediaRevokedAt (the server sets it before deleting any file):
// on a new value the tray empties, remounts (its reads and pending results go with it) and reloads, and any
// load that started before the delete is ignored. This seat's own delete calls revoke() the same way.

import { useCallback, useEffect, useRef, useState } from "react";
import type { TrayPhoto } from "./PhotoTray";

export type TrayLoad = () => Promise<{ photos: TrayPhoto[]; error: string | null }>;

/** mediaRevokedAt as stored (a Firestore Timestamp), in milliseconds; null when absent or not a timestamp. */
export function revokedAtMs(v: unknown): number | null {
  const toMillis = typeof v === "object" && v !== null ? (v as { toMillis?: unknown }).toMillis : undefined;
  return typeof toMillis === "function" ? Number((toMillis as () => number).call(v)) : null;
}

export function usePhotoTray(load: TrayLoad, revokedMs: number | null, enabled: boolean) {
  const [photos, setPhotos] = useState<TrayPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  // Bumped by every delete: a load keeps its result only if no delete happened since it started.
  const generation = useRef(0);

  const reload = useCallback(async () => {
    const started = generation.current;
    const r = await load();
    if (started !== generation.current) return;
    setPhotos(r.photos);
    setError(r.error);
  }, [load]);

  const revoke = useCallback(() => {
    generation.current += 1;
    setEpoch((n) => n + 1);
    setPhotos([]);
    void reload();
  }, [reload]);

  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);

  // A delete announced on the incident, by any seat. The value seen first is where this seat starts.
  const seen = useRef(revokedMs);
  useEffect(() => {
    if (revokedMs === null || revokedMs === seen.current) return;
    seen.current = revokedMs;
    revoke();
  }, [revokedMs, revoke]);

  return { photos, error, setError, epoch, reload, revoke };
}
