import { afterEach, describe, expect, it, vi } from "vitest";
import { captureFrames, captureFramesBySeek, type ThumbnailFrame } from "./frames";

function fakeCapture() {
  const drawImage = vi.fn();
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }) };
  const createImageBitmap = vi.fn(async (_source: unknown) => ({ close: vi.fn() }));
  vi.stubGlobal("createImageBitmap", createImageBitmap);
  let nextId = 0;
  const callbacks = new Map<number, VideoFrameRequestCallback>();
  const video = {
    paused: false,
    seeking: false,
    ownerDocument: { createElement: () => canvas },
    requestVideoFrameCallback(callback: VideoFrameRequestCallback) {
      callbacks.set(++nextId, callback);
      return nextId;
    },
    cancelVideoFrameCallback(id: number) {
      callbacks.delete(id);
    },
  };
  const frames: ThumbnailFrame[] = [];
  const stop = captureFrames(video as unknown as HTMLVideoElement, (frame) => frames.push(frame));
  let presentedFrames = 0;
  async function present(mediaTime: number) {
    presentedFrames += 1;
    const now = presentedFrames * 16;
    const pending = [...callbacks.values()];
    callbacks.clear();
    for (const callback of pending) {
      callback(now, { mediaTime, presentedFrames, presentationTime: now, expectedDisplayTime: now + 16, width: 640, height: 360 });
    }
    await Promise.resolve();
    await Promise.resolve();
  }
  return { video, canvas, drawImage, createImageBitmap, frames, stop, present, callbacks };
}

afterEach(() => vi.unstubAllGlobals());

describe("time machine thumbnails", () => {
  it("draws a 192x108 bitmap per half-second bucket during playback", async () => {
    const { video, canvas, drawImage, createImageBitmap, frames, stop, present } = fakeCapture();
    await present(0.04);
    await present(0.49);
    video.paused = true;
    await present(0.51);
    video.paused = false;
    video.seeking = true;
    await present(0.53);
    video.seeking = false;
    await present(0.55);
    await present(1);
    await present(0.09);

    expect(frames.map(({ timeS }) => timeS)).toEqual([0.04, 0.55, 1]);
    expect([canvas.width, canvas.height]).toEqual([192, 108]);
    expect(drawImage.mock.calls).toEqual(Array.from({ length: 3 }, () => [video, 0, 0, 192, 108]));
    expect(createImageBitmap.mock.calls).toEqual([[canvas], [canvas], [canvas]]);
    expect(frames[0]?.bitmap).toBe(await createImageBitmap.mock.results[0]?.value);
    stop();
  });

  it("stops requesting frames after 120 thumbnails", async () => {
    const { frames, drawImage, callbacks, present, stop } = fakeCapture();
    for (let index = 0; index < 125; index += 1) await present(index / 2);

    expect(frames).toHaveLength(120);
    expect(frames.at(-1)?.timeS).toBe(59.5);
    expect(drawImage).toHaveBeenCalledTimes(120);
    expect(callbacks.size).toBe(0);
    stop();
  });

  it("cancels callbacks and closes a pending bitmap when capture stops", async () => {
    const { frames, createImageBitmap, callbacks, present, stop } = fakeCapture();
    const bitmap = { close: vi.fn() };
    let finish = (_bitmap: typeof bitmap) => {};
    createImageBitmap.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));

    await present(0);
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
    stop();
    finish(bitmap);
    await present(0.5);

    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(frames).toEqual([]);
    expect(callbacks.size).toBe(0);
  });
});

function fakeSeekCapture(durationS: number) {
  const seeks: number[] = [];
  class Reader extends EventTarget {
    src = "";
    muted = false;
    playsInline = false;
    readyState = 0;
    duration = durationS;
    seeking = false;
    timeS = 0;
    load = vi.fn();
    removeAttribute = vi.fn((name: string) => { if (name === "src") this.src = ""; });

    get currentTime() { return this.timeS; }
    set currentTime(timeS: number) {
      seeks.push(timeS);
      this.timeS = timeS;
      this.seeking = true;
    }
  }
  const reader = new Reader();
  const drawImage = vi.fn();
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }) };
  const createImageBitmap = vi.fn(async (_source: unknown) => ({ close: vi.fn() }));
  vi.stubGlobal("document", { createElement: (tag: string) => tag === "video" ? reader : canvas });
  vi.stubGlobal("createImageBitmap", createImageBitmap);

  const frames: ThumbnailFrame[] = [];
  const stop = captureFramesBySeek("blob:clip", durationS, (frame) => frames.push(frame));

  async function loaded() {
    reader.readyState = 1;
    reader.dispatchEvent(new Event("loadedmetadata"));
    reader.readyState = 2;
    reader.dispatchEvent(new Event("loadeddata"));
    await Promise.resolve();
  }

  async function finishSeek() {
    reader.seeking = false;
    reader.dispatchEvent(new Event("seeked"));
    await Promise.resolve();
  }

  return { reader, seeks, canvas, drawImage, createImageBitmap, frames, stop, loaded, finishSeek };
}

describe("time machine thumbnails by seek", () => {
  it("captures zero and seeks through the duration in half-second order", async () => {
    const { reader, seeks, canvas, drawImage, createImageBitmap, frames, stop, loaded, finishSeek } = fakeSeekCapture(1.5);

    expect(reader).toMatchObject({ src: "blob:clip", muted: true, playsInline: true });
    expect(drawImage).not.toHaveBeenCalled();
    await loaded();
    expect(seeks).toEqual([0.5]);
    expect(frames.map(({ timeS }) => timeS)).toEqual([0]);
    await finishSeek();
    expect(seeks).toEqual([0.5, 1]);
    await finishSeek();
    await finishSeek();

    expect(seeks).toEqual([0.5, 1, 1.5]);
    expect(frames.map(({ timeS }) => timeS)).toEqual([0, 0.5, 1, 1.5]);
    expect(drawImage.mock.calls).toEqual(Array.from({ length: 4 }, () => [reader, 0, 0, 192, 108]));
    expect(createImageBitmap.mock.calls).toEqual([[canvas], [canvas], [canvas], [canvas]]);
    expect(frames[0]?.bitmap).toBe(await createImageBitmap.mock.results[0]?.value);
    stop();
  });

  it("stops seeking after 120 thumbnails", async () => {
    const { seeks, frames, drawImage, stop, loaded, finishSeek } = fakeSeekCapture(100);
    await loaded();
    for (let index = 1; index < 125; index += 1) await finishSeek();

    expect(frames).toHaveLength(120);
    expect(seeks).toEqual(Array.from({ length: 119 }, (_, index) => (index + 1) / 2));
    expect(drawImage).toHaveBeenCalledTimes(120);
    stop();
  });

  it("releases the reader and closes a pending bitmap when stopped", async () => {
    const { reader, seeks, frames, createImageBitmap, stop, loaded, finishSeek } = fakeSeekCapture(1);
    const bitmap = { close: vi.fn() };
    let finish = (_bitmap: typeof bitmap) => {};
    createImageBitmap.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));

    await loaded();
    expect(createImageBitmap).toHaveBeenCalledOnce();
    stop();
    finish(bitmap);
    await finishSeek();

    expect(reader.src).toBe("");
    expect(reader.load).toHaveBeenCalledOnce();
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(frames).toEqual([]);
    expect(seeks).toEqual([]);
  });
});
