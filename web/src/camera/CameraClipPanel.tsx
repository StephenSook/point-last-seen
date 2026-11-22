// The camera clip at the command post: the intake, then the reading's card with Confirm.
// Confirm hands the reading to the post (events, start point, prior) once and is not awaited;
// the status follows the prior version, like the other prior rebuilds.

import { useMemo, useRef, useState } from "react";
import type { ClipReadOutcome } from "../ai/clipRead";
import type { LatLon } from "../map/geo";
import { ClipIntake, type ClipIntakeInput, type ReadHow } from "./ClipIntake";
import type { TriageResult } from "./triage";
import { SightingCard } from "./SightingCard";

export type ClipRead = Extract<ClipReadOutcome, { kind: "read" }>;

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
};

export function CameraClipPanel({ camera, cameraSegmentId, choices, onPlaceCamera, onRead, onTriage, onConfirm, onClose, revocation }: Props) {
  const [read, setRead] = useState<{ o: ClipRead; input: ClipIntakeInput } | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  // The version the server acknowledged; a queued local write moves the local version at once.
  const [acked, setAcked] = useState<number | null>(null);
  // A result applies only while its Confirm is the latest one sent.
  const latest = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const clip = useMemo(() => (read ? new Blob([read.input.bytes as BlobPart], { type: read.input.mimeType }) : null), [read]);

  if (!read) {
    return (
      <ClipIntake
        revocation={revocation}
        camera={camera}
        cameraSegmentId={cameraSegmentId}
        choices={choices}
        onPlaceCamera={onPlaceCamera}
        onTriage={onTriage}
        onRead={async (input, how) => {
          const o = await onRead(input, how);
          if (o.kind === "read") setRead({ o, input });
          return o;
        }}
        onClose={onClose}
      />
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
