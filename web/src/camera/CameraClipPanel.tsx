// The camera clip at the command post: the intake, then the reading's card with Confirm.
// Confirm hands the reading to the post (events, start point, prior) once and is not awaited;
// the status follows the prior version, like the other prior rebuilds.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ClipReadOutcome } from "../ai/clipRead";
import type { TrackSent } from "../ai/clipTrack";
import type { Track } from "../extras/timemachine/types";
import type { LatLon } from "../map/geo";
import { ClipIntake, type ClipIntakeInput, type ReadHow } from "./ClipIntake";
import type { TriageResult } from "./triage";
import { SightingCard } from "./SightingCard";
import { trackStoppedLine } from "./timeMachine";

export type ClipRead = Extract<ClipReadOutcome, { kind: "read" }>;

/**
 * The clip's track for the time machine: being read, read or stored, or not read. `sent` is what this seat's track
 * read sent to the cloud (absent for a stored track, or when nothing left before it stopped).
 */
export type TrackView =
  | { status: "reading" }
  /** saved: whether this seat's new track was stored (absent for a stored track). */
  | { status: "ready"; track: Track; durationS: number; sent?: TrackSent; saved?: Promise<boolean> }
  | { status: "failed"; message: string; durationS: number | null; sent?: TrackSent };

export const TRACK_FAILED = "The person's track could not be read. The time machine shows the clearest frame.";
export const MEDIA_DELETED_NOTICE = "This search's clips and photos were deleted. Give the consents again to read a clip.";
export const TRACK_NOT_SAVED = "The track was not saved, so another seat will read its own.";
export const TRACK_TOO_LONG = "This clip is too long to track (more than two minutes). The time machine shows the clearest frame.";

type Props = {
  camera: LatLon | null;
  cameraSegmentId: string | null;
  choices: readonly { segmentId: string; centre: LatLon }[];
  onPlaceCamera: (p: LatLon) => void;
  onRead: (input: ClipIntakeInput, how: ReadHow) => Promise<ClipReadOutcome>;
  onTriage?: (clip: Blob) => Promise<TriageResult>;
  /** note: why the rebuild turned the elevation layer off, when it did. */
  onConfirm: (read: ClipRead, input: ClipIntakeInput) => { version: number; ack: Promise<void>; note?: string };
  onClose: () => void;
  /** Changes whenever this search's media is deleted; the clip form then drops every consent given. */
  revocation?: number;
  /** After a read: the clip's track, from the store or a new read on the same consented window. */
  onTrack?: (read: ClipRead, input: ClipIntakeInput, how: ReadHow) => Promise<TrackView>;
  /** Remote Config time_machine_enabled: whether the card offers the time machine. */
  timeMachine?: boolean;
  /** A track read that stopped after this panel closed, with what had already left (the post says it). */
  onTrackStopped?: (sent: TrackSent) => void;
};

export function CameraClipPanel({ camera, cameraSegmentId, choices, onPlaceCamera, onRead, onTriage, onConfirm, onClose, revocation, onTrack, timeMachine = false, onTrackStopped }: Props) {
  const [read, setRead] = useState<{ o: ClipRead; input: ClipIntakeInput } | null>(null);
  const [track, setTrack] = useState<TrackView | null>(null);
  const [trackUnsaved, setTrackUnsaved] = useState(false);
  // What a track read stopped by a delete had already sent, said under the delete notice.
  const [stoppedSent, setStoppedSent] = useState<TrackSent | null>(null);
  const mounted = useRef(true);
  const [sent, setSent] = useState<number | null>(null);
  // The version the server acknowledged; a queued local write moves the local version at once.
  const [acked, setAcked] = useState<number | null>(null);
  // A result applies only while its Confirm is the latest one sent.
  const latest = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const clip = useMemo(() => (read ? new Blob([read.input.bytes as BlobPart], { type: read.input.mimeType }) : null), [read]);
  // The flag as it is now, not as it was when a read was pressed.
  const machineOn = useRef(timeMachine);
  machineOn.current = timeMachine;
  // This panel owns the read and the track job after the form is gone: a delete of the search's media (or closing
  // the panel) moves the epoch, which clears the card and the time machine and drops any result still on its way.
  const epoch = useRef(0);
  const lastRevocation = useRef(revocation);
  useLayoutEffect(() => {
    if (revocation === lastRevocation.current) return;
    lastRevocation.current = revocation;
    epoch.current++;
    // A Confirm still waiting on its write no longer belongs to any card: its late result is dropped.
    latest.current++;
    if (read) setDeleted(true);
    setRead(null);
    setTrack(null);
    setSent(null);
    setAcked(null);
    setError(null);
    setNote(null);
  }, [revocation, read]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.current++;
    };
  }, []);

  if (!read) {
    return (
      <>
      {deleted && (
        <p className="muted small" role="status">
          {MEDIA_DELETED_NOTICE}
          {stoppedSent ? ` ${trackStoppedLine(stoppedSent)}` : ""}
        </p>
      )}
      <ClipIntake
        revocation={revocation}
        camera={camera}
        cameraSegmentId={cameraSegmentId}
        choices={choices}
        onPlaceCamera={onPlaceCamera}
        onTriage={onTriage}
        onRead={async (input, how) => {
          const at = epoch.current;
          const o = await onRead(input, how);
          if (o.kind !== "read" || at !== epoch.current) return o;
          setDeleted(false);
          setStoppedSent(null);
          setTrackUnsaved(false);
          setRead({ o, input });
          if (onTrack && machineOn.current) {
            const current = () => at === epoch.current && (how?.stillCurrent?.() ?? true);
            setTrack({ status: "reading" });
            onTrack(o, input, { ...how, stillCurrent: current }).then(
              (v) => {
                if (current()) {
                  setTrack(v);
                  if (v.status === "ready") v.saved?.then((ok) => !ok && current() && setTrackUnsaved(true));
                  return;
                }
                // The card is gone; a read that had sent frames before it stopped still says so.
                const s = v.status !== "reading" ? v.sent : undefined;
                if (!s) return;
                if (mounted.current) setStoppedSent(s);
                else onTrackStopped?.(s);
              },
              () => current() && setTrack({ status: "failed", message: TRACK_FAILED, durationS: null }),
            );
          }
          return o;
        }}
        onClose={onClose}
      />
      </>
    );
  }

  function confirm() {
    if (!read) return;
    setError(null);
    try {
      const { version, ack, note: why } = onConfirm(read.o, read.input);
      const id = ++latest.current;
      setSent(version);
      setNote(why ?? null);
      ack.then(
        () => id === latest.current && setAcked(version),
        () => {
          if (id !== latest.current) return;
          setSent(null);
          setError("The sighting was not saved. Try again.");
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "The sighting was not saved. Try again.");
    }
  }

  return (
    <div className="clip-panel">
      <SightingCard
        reading={read.o.reading}
        clipStartMs={read.input.clipStartMs}
        bearingDeg={read.o.bearingDeg}
        colorSuppressed={read.o.colorSuppressed}
        cached={read.o.cached}
        clip={clip}
        durationS={read.input.durationS}
        route={read.o.route}
        sentBytes={read.o.sentBytes}
        track={track}
        trackNote={trackUnsaved ? TRACK_NOT_SAVED : null}
        timeMachine={timeMachine}
      />
      {sent === null ? (
        <div className="row">
          <button type="button" className="btn" onClick={confirm}>
            Confirm sighting
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Discard
          </button>
        </div>
      ) : (
        <>
          <p role="status">
            {acked === sent ? `Confirmed. Prior rebuilt as v${sent}.` : `Confirmed. Prior rebuilt on this device as v${sent}. Sending.`}
            {note ? ` ${note}` : ""}
          </p>
          <button type="button" className="btn ghost" onClick={onClose}>
            Done
          </button>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
