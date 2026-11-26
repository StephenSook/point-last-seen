export type ThumbnailFrame = { readonly timeS: number; readonly bitmap: ImageBitmap };

const WIDTH = 192;
const HEIGHT = 108;
const INTERVAL_S = 0.5;
const MAX_FRAMES = 120;

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
      void createImageBitmap(canvas).then(
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
