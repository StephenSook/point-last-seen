import { useId, useState, type JSX } from "react";
import type { DockProps } from "./types";
import "./extras.css";

export function ExtrasDock({ state }: DockProps): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const menuId = useId();

  if (state.denied || state.view === null) return null;

  return (
    <div
      className="extras-dock"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
        }
      }}
    >
      <button
        className="btn ghost"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
      >
        More
      </button>
      <div id={menuId} className="extras-menu" role="menu" aria-label="More" hidden={!open} />
    </div>
  );
}
