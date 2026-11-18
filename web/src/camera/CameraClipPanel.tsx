// The camera clip at the command post: the intake, then the reading's card with Confirm.
// Confirm hands the reading to the post (events, start point, prior) once and is not awaited;
// the status follows the prior version, like the other prior rebuilds.

import { useMemo, useState } from "react";
import type { ClipReadOutcome } from "../ai/clipRead";
import type { LatLon } from "../map/geo";
import { ClipIntake, type ClipIntakeInput } from "./ClipIntake";
import { SightingCard } from "./SightingCard";

export type ClipRead = Extract<ClipReadOutcome, { kind: "read" }>;

type Props = {
  camera: LatLon | null;
  cameraSegmentId: string | null;
  choices: readonly { segmentId: string; centre: LatLon }[];
  onPlaceCamera: (p: LatLon) => void;
  priorVersion: number;
  onRead: (input: ClipIntakeInput) => Promise<ClipReadOutcome>;
  onConfirm: (read: ClipRead, input: ClipIntakeInput) => { version: number; ack: Promise<void> };
  onClose: () => void;
};

export function CameraClipPanel({ camera, cameraSegmentId, choices, onPlaceCamera, priorVersion, onRead, onConfirm, onClose }: Props) {
  const [read, setRead] = useState<{ o: ClipRead; input: ClipIntakeInput } | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clip = useMemo(() => (read ? new Blob([read.input.bytes as BlobPart], { type: read.input.mimeType }) : null), [read]);

  if (!read) {
    return (
      <ClipIntake
        camera={camera}
        cameraSegmentId={cameraSegmentId}
        choices={choices}
        onPlaceCamera={onPlaceCamera}
        onRead={async (input) => {
          const o = await onRead(input);
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
      const { version, ack } = onConfirm(read.o, read.input);
      setSent(version);
      ack.catch(() => {
        setSent(null);
        setError("The sighting was not saved. Try again.");
      });
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
          <p role="status">{priorVersion >= sent ? `Confirmed. Prior rebuilt as v${sent}.` : `Confirmed. Prior rebuilt on this laptop as v${sent}. Sending.`}</p>
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
