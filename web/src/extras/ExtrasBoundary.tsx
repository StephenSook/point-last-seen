import { Component, type ReactNode } from "react";

export const PANEL_LOAD_FAILED = "This panel could not load. Reconnect, then reload the page.";

/**
 * Keeps one extras panel's failure inside that panel. A panel that loads on first use can fail to load (the link
 * dropped before it was fetched); without this, React would remove the whole command post or judge page. A browser
 * keeps a failed module load until the page reloads, so there is no retry button: the message says what works.
 */
export class ExtrasBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return this.props.fallback ?? <p role="alert" className="extras-panel-error">{PANEL_LOAD_FAILED}</p>;
  }
}
