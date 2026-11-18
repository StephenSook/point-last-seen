// What the newest report did: one banner line, a screen-reader line, and Hold
// Space to see the map before that report (the map swaps back on release).

import { useEffect } from "react";
import type { ChangeResult } from "./changeModel";

// Space keeps its normal job in fields and on buttons.
const typingTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(t.tagName));

export function ChangeBeat({ change, holding, onHold }: { change: ChangeResult | null; holding: boolean; onHold: (holding: boolean) => void }) {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || typingTarget(e.target)) return;
      e.preventDefault();
      onHold(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") onHold(false);
    };
    const release = () => onHold(false);
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    addEventListener("blur", release);
    return () => {
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
      removeEventListener("blur", release);
    };
  }, [onHold]);

  if (!change) return null;
  return (
    <section aria-labelledby="change-h" className="change" data-testid="change">
      <h2 id="change-h" className="label">What changed</h2>
      <p data-testid="change-banner">{change.banner}</p>
      {holding && <p className="tag">Before this report</p>}
      <p className="sr-only" role="status" aria-live="polite">
        {change.announce}
      </p>
    </section>
  );
}
