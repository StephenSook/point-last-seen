import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import TimeMachine from "./TimeMachine";
import type { TimeMachineProps, Track } from "./types";

const { block } = vi.hoisted(() => ({ block: vi.fn((_props: unknown) => null) }));
vi.mock("./Block", () => ({ Block: block }));
vi.mock("@react-three/fiber", () => ({ Canvas: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

const props: TimeMachineProps = {
  video: {} as HTMLVideoElement,
  durationS: 20,
  track: null,
  keyFrame: { timeS: 7, box: [100, 200, 400, 600] },
  results: [
    { id: "first_seen", label: "First seen 0:04", timeS: 4 },
    { id: "last_seen", label: "Last seen 0:12", timeS: 12 },
  ],
  clock: { now: () => ({ timeS: 0, source: "video" }), set: vi.fn(), jumpTo: vi.fn(), frameS: () => 1 / 30, subscribe: () => () => {} },
};

const track: Track = {
  version: "track-v1",
  window: { startS: 4, endS: 12 },
  entries: [{ t: 4, box: [100, 200, 400, 600], source: "cloud" }],
};

afterEach(() => {
  vi.unstubAllGlobals();
  block.mockClear();
});

describe("TimeMachine", () => {
  it("renders result buttons in a list and repeats the labels as plain text", () => {
    const markup = renderToStaticMarkup(<TimeMachine {...props} />);

    expect(markup).toContain('<ol><li><button type="button">First seen 0:04</button></li><li><button type="button">Last seen 0:12</button></li></ol>');
    expect(markup).toContain("<p>First seen 0:04\nLast seen 0:12</p>");
  });

  it("passes the key frame and its box to the scene when the track is null", () => {
    renderToStaticMarkup(<TimeMachine {...props} />);

    expect(block.mock.lastCall?.[0]).toMatchObject({ segments: null, keyFrame: props.keyFrame, animateIntro: false });
  });

  it("renders the clock label and enables scrubbing without a track", () => {
    const markup = renderToStaticMarkup(<TimeMachine {...props} />);

    expect(markup).toContain('data-scrubbable="true"');
    expect(markup).toContain('<time class="tm-clock" aria-hidden="true"></time>');
  });

  it("skips the tracked intro when reduced motion is requested", () => {
    const matchMedia = vi.fn(() => ({ matches: true }));
    vi.stubGlobal("window", { matchMedia });
    renderToStaticMarkup(<TimeMachine {...props} track={track} />);

    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    expect(block.mock.lastCall?.[0]).toMatchObject({ animateIntro: false, segments: [{ entries: track.entries }] });
  });

  it("enables the intro for a linked track with default motion", () => {
    renderToStaticMarkup(<TimeMachine {...props} track={track} />);

    expect(block.mock.lastCall?.[0]).toMatchObject({ animateIntro: true, segments: [{ startS: 4, endS: 4 }] });
  });
});
