import { afterEach, describe, expect, it, vi } from "vitest";
import { bindVideo, createClock } from "./clock";
import type { ClockTick } from "./types";

class FakeVideo extends EventTarget {
  paused = false;
  seeking = false;
  readonly seeks: number[] = [];
  private timeS = 0;
  private nextId = 0;
  private callbacks = new Map<number, VideoFrameRequestCallback>();

  get currentTime() {
    return this.timeS;
  }

  set currentTime(timeS: number) {
    this.seeks.push(timeS);
    this.timeS = timeS;
    this.seeking = true;
    this.dispatchEvent(new Event("seeking"));
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }

  play() {
    this.paused = false;
    return Promise.resolve();
  }

  finishSeek() {
    this.seeking = false;
    this.dispatchEvent(new Event("seeked"));
  }

  requestVideoFrameCallback(callback: VideoFrameRequestCallback) {
    this.callbacks.set(++this.nextId, callback);
    return this.nextId;
  }

  cancelVideoFrameCallback(id: number) {
    this.callbacks.delete(id);
  }

  present(mediaTime: number, presentedFrames: number, now = presentedFrames * 16) {
    this.timeS = mediaTime;
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of callbacks) {
      callback(now, { mediaTime, presentedFrames, presentationTime: now, expectedDisplayTime: now + 16, width: 640, height: 360 });
    }
  }

  key(key: string, options: { shiftKey?: boolean; repeat?: boolean } = {}) {
    const event = Object.assign(new Event("keydown", { cancelable: true }), { key, ...options });
    this.dispatchEvent(event);
    return event.defaultPrevented;
  }
}

function bindFakeVideo() {
  const clock = createClock({ durationS: 10 });
  const video = new FakeVideo();
  const unbind = bindVideo(clock, video as unknown as HTMLVideoElement);
  const ticks: ClockTick[] = [];
  clock.subscribe((tick) => ticks.push(tick));
  return { clock, video, ticks, unbind };
}

function fakeAnimationFrames() {
  let now = 0;
  let nextId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("performance", { now: () => now });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callbacks.set(++nextId, callback);
    return nextId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
  return (timeMs: number) => {
    now = timeMs;
    const pending = [...callbacks.values()];
    callbacks.clear();
    for (const callback of pending) callback(now);
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("the time machine clock", () => {
  it("clamps clock ticks and lets listeners unsubscribe", () => {
    const clock = createClock({ durationS: 10 });
    const ticks: ClockTick[] = [];
    const unsubscribe = clock.subscribe((tick) => ticks.push(tick));

    clock.set(-2, "video");
    clock.set(20, "scene");
    unsubscribe();
    clock.set(3, "scene");

    expect(ticks).toEqual([{ timeS: 0, source: "video" }, { timeS: 10, source: "scene" }]);
    expect(clock.now()).toEqual({ timeS: 3, source: "scene" });
  });

  it("does not echo playback frames as seeks or scene seeks as video ticks", () => {
    const { clock, video, ticks, unbind } = bindFakeVideo();
    video.present(2, 60);
    expect(video.seeks).toEqual([]);

    clock.set(7, "scene");
    expect(video.paused).toBe(true);
    expect(video.seeks).toEqual([7]);
    video.present(7, 61);
    video.finishSeek();
    video.present(7, 62);

    expect(ticks).toEqual([{ timeS: 2, source: "video" }, { timeS: 7, source: "scene" }]);
    unbind();
    void video.play();
    video.present(8, 63);
    expect(ticks.at(-1)).toEqual({ timeS: 7, source: "scene" });
    clock.set(9, "scene");
    expect(clock.now()).toEqual({ timeS: 9, source: "scene" });
    expect(video.seeks).toEqual([7]);
    expect(video.paused).toBe(false);
    expect(video.key(" ")).toBe(false);
  });

  it("follows a seek made with the player's own controls while paused, and not its own seeks", () => {
    const { clock, video, ticks, unbind } = bindFakeVideo();
    video.pause();
    video.currentTime = 4;
    video.finishSeek();
    expect(ticks).toEqual([{ timeS: 4, source: "video" }]);

    clock.set(6, "scene");
    video.finishSeek();
    expect(ticks).toEqual([{ timeS: 4, source: "video" }, { timeS: 6, source: "scene" }]);

    void video.play();
    video.currentTime = 8;
    video.finishSeek();
    expect(ticks.at(-1)).toEqual({ timeS: 6, source: "scene" });
    unbind();
  });

  it("runs only the latest queued seek after the current seek finishes", () => {
    const { clock, video, unbind } = bindFakeVideo();
    clock.set(2, "scene");
    clock.set(3, "scene");
    clock.set(6, "scene");
    expect(video.seeks).toEqual([2]);

    video.finishSeek();
    expect(video.seeks).toEqual([2, 6]);
    video.finishSeek();
    expect(video.seeks).toEqual([2, 6]);
    unbind();
  });

  it("learns frame spacing from media timestamps and ignores seek gaps", () => {
    const { clock, video, unbind } = bindFakeVideo();
    expect(clock.frameS()).toBe(1 / 30);
    video.present(1, 24, 20);
    video.present(1.125, 27, 180);
    expect(clock.frameS()).toBeCloseTo(1 / 24);

    video.currentTime = 8;
    video.finishSeek();
    video.present(8, 28, 200);
    expect(clock.frameS()).toBeCloseTo(1 / 24);
    video.present(8.05, 29, 218);
    expect(clock.frameS()).toBeCloseTo(0.05);
    unbind();
  });

  it("steps one video frame with arrows and one second with Shift", () => {
    const { video, unbind } = bindFakeVideo();
    video.present(3.95, 79);
    video.present(4, 80);

    expect(video.key("ArrowLeft")).toBe(true);
    expect(video.currentTime).toBeCloseTo(3.95);
    video.finishSeek();
    expect(video.key("ArrowRight")).toBe(true);
    expect(video.currentTime).toBeCloseTo(4);
    video.finishSeek();
    expect(video.key("ArrowRight", { shiftKey: true })).toBe(true);
    expect(video.currentTime).toBeCloseTo(5);
    video.finishSeek();
    expect(video.key("ArrowLeft", { shiftKey: true })).toBe(true);
    expect(video.currentTime).toBeCloseTo(4);
    unbind();
  });

  it("toggles playback with Space and ignores a held-down Space", () => {
    const { video, unbind } = bindFakeVideo();
    expect(video.key(" ")).toBe(true);
    expect(video.paused).toBe(true);
    expect(video.key(" ", { repeat: true })).toBe(true);
    expect(video.paused).toBe(true);
    expect(video.key(" ")).toBe(true);
    expect(video.paused).toBe(false);
    unbind();
  });

  it("ends a 400 ms jump with exactly one scene tick and one video seek", () => {
    const advance = fakeAnimationFrames();
    const { clock, video, ticks, unbind } = bindFakeVideo();
    video.present(2, 60);
    ticks.length = 0;

    clock.jumpTo(8);
    video.present(2.1, 63);
    advance(200);
    expect(clock.now()).toEqual({ timeS: 5, source: "tween" });
    expect(ticks.every((tick) => tick.source === "tween")).toBe(true);
    expect(video.seeks).toEqual([]);

    advance(400);
    advance(600);
    expect(ticks.filter((tick) => tick.source === "scene")).toEqual([{ timeS: 8, source: "scene" }]);
    expect(ticks.at(-1)).toEqual({ timeS: 8, source: "scene" });
    expect(video.seeks).toEqual([8]);
    expect(video.paused).toBe(true);
    unbind();
  });

  it("cancels a jump when the scene sets a new time", () => {
    const advance = fakeAnimationFrames();
    const clock = createClock({ durationS: 10 });
    clock.jumpTo(9);
    advance(100);
    clock.set(4, "scene");
    advance(500);
    expect(clock.now()).toEqual({ timeS: 4, source: "scene" });
  });
});
