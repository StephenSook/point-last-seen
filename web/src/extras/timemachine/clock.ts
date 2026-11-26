import type { BindVideo, ClockSource, ClockTick, CreateClock, TimeClock } from "./types";

const DEFAULT_FRAME_S = 1 / 30;
const DEFAULT_JUMP_MS = 400;

// The video binding can report frame timing without adding a method to the shared clock contract.
const frameTiming = new WeakMap<TimeClock, (seconds: number) => void>();

export const createClock: CreateClock = ({ durationS }) => {
  let tick: ClockTick = { timeS: 0, source: "video" };
  let secondsPerFrame = DEFAULT_FRAME_S;
  let animationId: number | undefined;
  const listeners = new Set<(tick: ClockTick) => void>();

  function clamp(timeS: number) {
    return Math.max(0, Math.min(timeS, durationS));
  }

  function publish(timeS: number, source: ClockSource) {
    const next = { timeS, source };
    tick = next;
    for (const listener of listeners) listener(next);
  }

  function cancelJump() {
    if (animationId === undefined) return;
    cancelAnimationFrame(animationId);
    animationId = undefined;
  }

  const clock: TimeClock = {
    now: () => tick,
    set(timeS, source) {
      if (Number.isNaN(timeS)) return;
      cancelJump();
      publish(clamp(timeS), source);
    },
    jumpTo(timeS, ms = DEFAULT_JUMP_MS) {
      if (Number.isNaN(timeS)) return;
      cancelJump();
      const from = tick.timeS;
      const target = clamp(timeS);
      if (ms <= 0 || !Number.isFinite(ms)) {
        publish(target, "scene");
        return;
      }

      const startedAt = performance.now();
      function step(now: number) {
        const progress = (now - startedAt) / ms;
        if (progress >= 1) {
          animationId = undefined;
          publish(target, "scene");
          return;
        }
        animationId = requestAnimationFrame(step);
        publish(from + (target - from) * Math.max(0, progress), "tween");
      }

      animationId = requestAnimationFrame(step);
      publish(from, "tween");
    },
    frameS: () => secondsPerFrame,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };

  frameTiming.set(clock, (seconds) => { secondsPerFrame = seconds; });
  return clock;
};

/** The shortcuts are scoped to the focused video element. */
export const bindVideo: BindVideo = (clock, video) => {
  let queuedSeek: number | undefined;
  let previousFrame: VideoFrameCallbackMetadata | undefined;
  let frameId: number | undefined;
  const reportFrameS = frameTiming.get(clock);

  function resetFrameTiming() {
    previousFrame = undefined;
  }

  function seek(timeS: number) {
    if (video.seeking) {
      queuedSeek = timeS;
      return;
    }
    queuedSeek = undefined;
    if (video.currentTime !== timeS) {
      resetFrameTiming();
      video.currentTime = timeS;
    }
  }

  function onSeeked() {
    if (queuedSeek !== undefined) seek(queuedSeek);
  }

  const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
    frameId = video.requestVideoFrameCallback(onFrame);
    if (video.paused || video.seeking || queuedSeek !== undefined) {
      resetFrameTiming();
      return;
    }

    if (previousFrame) {
      const elapsedS = metadata.mediaTime - previousFrame.mediaTime;
      const frames = metadata.presentedFrames - previousFrame.presentedFrames;
      if (elapsedS > 0 && frames > 0) reportFrameS?.(elapsedS / frames);
    }
    previousFrame = metadata;

    // Let the tween lead the view until its final scene tick takes over the player.
    if (clock.now().source !== "tween") clock.set(metadata.mediaTime, "video");
  };

  function onKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const stepS = event.shiftKey ? 1 : clock.frameS();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      clock.set(clock.now().timeS + direction * stepS, "scene");
    } else if (event.key === " ") {
      event.preventDefault();
      if (event.repeat) return;
      if (video.paused) void video.play().catch(() => {});
      else video.pause();
    }
  }

  const unsubscribe = clock.subscribe(({ timeS, source }) => {
    if (source !== "scene") return;
    video.pause();
    seek(timeS);
  });
  video.addEventListener("seeking", resetFrameTiming);
  video.addEventListener("seeked", onSeeked);
  video.addEventListener("pause", resetFrameTiming);
  video.addEventListener("keydown", onKeyDown);
  frameId = video.requestVideoFrameCallback?.(onFrame);

  return () => {
    unsubscribe();
    video.removeEventListener("seeking", resetFrameTiming);
    video.removeEventListener("seeked", onSeeked);
    video.removeEventListener("pause", resetFrameTiming);
    video.removeEventListener("keydown", onKeyDown);
    if (frameId !== undefined) video.cancelVideoFrameCallback(frameId);
  };
};
