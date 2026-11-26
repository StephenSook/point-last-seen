// Frames from a clip on this laptop, for on-device triage (P-39). Nothing here leaves the
// browser: the clip is decoded by a <video> element from a local object URL.

import { MOTION, type MotionFrame } from "./motion";

function load(clip: Blob): Promise<{ v: HTMLVideoElement; done: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(clip);
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    const done = () => {
      v.removeAttribute("src");
      v.load();
      URL.revokeObjectURL(url);
    };
    v.onloadeddata = () => resolve({ v, done });
    v.onerror = () => {
      done();
      reject(new Error("This clip could not be decoded here."));
    };
    v.src = url;
  });
}

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    v.onseeked = () => resolve();
    v.currentTime = t;
  });
}

const same = (a: Float32Array, b: Float32Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Draws a sample, and draws it again (after `wait`, up to `tries` more times) while it is byte-identical to the
 * previous sample: under load "seeked" can fire before the new frame is decoded, and the canvas then reads the
 * previous frame, which would read as a still span. A truly still clip settles on the same frame and costs only
 * the waits.
 */
export async function settledDraw(draw: () => Float32Array, prev: Float32Array | null, wait: () => Promise<void>, tries = 3): Promise<Float32Array> {
  let px = draw();
  for (let i = 0; i < tries && prev && same(px, prev); i++) {
    await wait();
    px = draw();
  }
  return px;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Grey frames (0 to 1) every `everyS` seconds at width x height, with the clip's length. */
export async function sampleFrames(clip: Blob, everyS: number = MOTION.sampleEveryS, width: number = MOTION.width, height: number = MOTION.height): Promise<{ durationS: number; frames: MotionFrame[] }> {
  const { v, done } = await load(clip);
  try {
    const durationS = v.duration;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx || !Number.isFinite(durationS)) throw new Error("This clip could not be decoded here.");
    const frames: MotionFrame[] = [];
    const grey = (): Float32Array => {
      ctx.drawImage(v, 0, 0, width, height);
      const rgba = ctx.getImageData(0, 0, width, height).data;
      const px = new Float32Array(width * height);
      for (let i = 0; i < px.length; i++) px[i] = (0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!) / 255;
      return px;
    };
    for (let t = 0; t < durationS; t += everyS) {
      await seek(v, t);
      frames.push({ t, px: await settledDraw(grey, frames.at(-1)?.px ?? null, nextFrame) });
    }
    return { durationS, frames };
  } finally {
    done();
  }
}

/** The clip's exact length in seconds, decoded here. */
export async function clipDurationS(clip: Blob): Promise<number> {
  const { v, done } = await load(clip);
  try {
    if (!Number.isFinite(v.duration) || v.duration <= 0) throw new Error("This clip could not be decoded here.");
    return v.duration;
  } finally {
    done();
  }
}

/** One frame as a JPEG (base64, longest side at most `maxSide`), for the laptop's model. */
export async function jpegAt(clip: Blob, t: number, maxSide = 768): Promise<string> {
  const { v, done } = await load(clip);
  try {
    await seek(v, t);
    const scale = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no frame"))), "image/jpeg", 0.85));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  } finally {
    done();
  }
}
