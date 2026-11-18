import { useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import "./print.css";

type DialogProps = {
  title: string;
  onClose: () => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
};

const focusable = 'button:not([disabled]), input:not([disabled])';

export function ExtrasDialog({ title, onClose, returnFocus, children, printing = false }: DialogProps & { printing?: boolean }) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const root = document.getElementById("root");
    const wasInert = root?.inert ?? false;
    if (root) root.inert = true;
    if (printing) document.body.classList.add("extras-printing");
    (dialog.current?.querySelector<HTMLElement>("[data-initial-focus]") ?? heading.current)?.focus();
    return () => {
      if (root) root.inert = wasInert;
      if (printing) document.body.classList.remove("extras-printing");
      returnFocus.current?.focus();
    };
  }, [printing, returnFocus]);

  return createPortal(
    <div
      className={`extras-dialog${printing ? " extras-print-dialog" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      ref={dialog}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
        if (event.key === "Tab") {
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(focusable));
          const first = controls[0];
          const last = controls.at(-1);
          if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <div className="extras-dialog-content">
        <h2 className="extras-screen-only" id={titleId} ref={heading} tabIndex={-1}>{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

type PrintRootProps = DialogProps & {
  controls?: ReactNode;
  emptyMessage?: string;
  drillLine?: string | null;
  staleMessage?: string | null;
};

export function PrintRoot({ controls, emptyMessage, drillLine, staleMessage, children, ...dialogProps }: PrintRootProps) {
  return (
    <ExtrasDialog {...dialogProps} printing>
      <div className="extras-print-toolbar extras-screen-only">
        {emptyMessage && drillLine && <p className="extras-drill-line">{drillLine}</p>}
        {controls}
        {staleMessage && <p role="status">{staleMessage}</p>}
        {emptyMessage && <p>{emptyMessage}</p>}
        <div className="extras-dialog-actions">
          <button type="button" disabled={Boolean(emptyMessage)} onClick={() => window.print()}>Print</button>
          <button type="button" onClick={dialogProps.onClose}>Close</button>
        </div>
      </div>
      {children}
    </ExtrasDialog>
  );
}
