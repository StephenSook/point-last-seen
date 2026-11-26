export type ThumbnailFrame = { readonly timeS: number; readonly bitmap: ImageBitmap };

const WIDTH = 192;
const HEIGHT = 108;
const INTERVAL_S = 0.5;
const MAX_FRAMES = 120;
const BITMAP_OPTIONS: ImageBitmapOptions = { imageOrientation: "flipY", premultiplyAlpha: "none" };

/** Captures playing frames locally. The caller owns each delivered bitmap and must close it. */
export function captureFrames(video: HTMLVideoElement, onFrame: (frame: ThumbnailFrame) => void): () => void {
  if (!video.requestVideoFrameCallback || typeof createImageBitmap !== "function") return () => {};
  const canvas = video.ownerDocument.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) return () => {};

  const captured = new Set<number>();
  let stopped = false;
  let frameId: number | undefined;

  function schedule() {
    if (!stopped && frameId === undefined && captured.size < MAX_FRAMES) {
      frameId = video.requestVideoFrameCallback(readFrame);
    }
  }

  function readFrame(_now: number, { mediaTime }: VideoFrameCallbackMetadata) {
    frameId = undefined;
    if (stopped) return;

    const bucket = Math.floor(mediaTime / INTERVAL_S);
    if (!video.paused && !video.seeking && !captured.has(bucket)) {
      captured.add(bucket);
      context!.drawImage(video, 0, 0, WIDTH, HEIGHT);
      void createImageBitmap(canvas, BITMAP_OPTIONS).then(
        (bitmap) => {
          if (stopped) bitmap.close();
          else onFrame({ timeS: mediaTime, bitmap });
        },
        () => {
          captured.delete(bucket);
          schedule();
        },
      );
    }
    schedule();
  }

  schedule();
  return () => {
    stopped = true;
    if (frameId !== undefined) video.cancelVideoFrameCallback(frameId);
    frameId = undefined;
  };
}

/** Seeks a detached reader without playing the clip. The caller owns each delivered bitmap. */
export function captureFramesBySeek(src: string, durationS: number, onFrame: (frame: ThumbnailFrame) => void): () => void {
  if (!src || !Number.isFinite(durationS) || durationS < 0 || typeof createImageBitmap !== "function") return () => {};
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) return () => {};

  const reader = document.createElement("video");
  let stopped = false;
  let pending = false;
  let index = 0;
  let lastTimeS = -1;

  function stop() {
    if (stopped) return;
    stopped = true;
    reader.removeEventListener("loadedmetadata", start);
    reader.removeEventListener("loadeddata", readFrame);
    reader.removeEventListener("seeked", readFrame);
    reader.removeEventListener("error", stop);
    reader.removeAttribute("src");
    reader.load();
    canvas.width = 0;
    canvas.height = 0;
  }

  function seekNext() {
    const timeS = index * INTERVAL_S;
    if (index >= MAX_FRAMES || timeS > lastTimeS) {
      stop();
      return;
    }
    if (reader.currentTime !== timeS) reader.currentTime = timeS;
    void readFrame();
  }

  function start() {
    lastTimeS = Math.min(durationS, reader.duration);
    seekNext();
  }

  async function readFrame() {
    const timeS = index * INTERVAL_S;
    if (stopped || pending || timeS > lastTimeS || reader.seeking || reader.readyState < 2 || reader.currentTime !== timeS) return;

    pending = true;
    let bitmap: ImageBitmap;
    try {
      context!.drawImage(reader, 0, 0, WIDTH, HEIGHT);
      bitmap = await createImageBitmap(canvas, BITMAP_OPTIONS);
    } catch {
      stop();
      return;
    }
    if (stopped) {
      bitmap.close();
      return;
    }
    onFrame({ timeS, bitmap });
    if (stopped) return;
    pending = false;
    index += 1;
    seekNext();
  }

  reader.preload = "auto";
  reader.muted = true;
  reader.playsInline = true;
  reader.addEventListener("loadedmetadata", start);
  reader.addEventListener("loadeddata", readFrame);
  reader.addEventListener("seeked", readFrame);
  reader.addEventListener("error", stop);
  reader.src = src;
  return stop;
}
