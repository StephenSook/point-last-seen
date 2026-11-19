// A new deploy's service worker installs while the page runs the old build, then takes over (skipWaiting,
// clientsClaim). Without a reload the open page keeps running the old build until the next visit. This
// reloads once when that happens, unless a field holds typed words: then the page asks, so nothing typed is lost.

type SwLike = { controller: unknown; addEventListener: (type: "controllerchange", fn: () => void) => void };

export function watchForNewBuild(opts: { sw: SwLike | undefined; reload: () => void; unsaved: () => boolean; ask: () => void }): void {
  const { sw } = opts;
  // No worker served this page: it was fetched from the network, so it already runs the newest build.
  if (!sw || !sw.controller) return;
  let handled = false;
  sw.addEventListener("controllerchange", () => {
    if (handled) return;
    handled = true;
    if (opts.unsaved()) opts.ask();
    else opts.reload();
  });
}

const TYPED = new Set(["text", "textarea", "search", "email", "tel", "url", "number", ""]);

/** True when a field a person types into holds non-blank words. Choices and files are not typed words. */
export function hasUnsavedText(fields: Iterable<{ type: string; value: string }>): boolean {
  for (const f of fields) if (TYPED.has(f.type) && f.value.trim() !== "") return true;
  return false;
}

/** How often an open page asks whether a new deploy's worker is waiting (a demo tab can stay open for hours). */
const UPDATE_EVERY_MS = 30 * 60 * 1000;

/**
 * Wires the watch to this page: reload, or a status line with a Reload button while words are typed. The page
 * also answers the new worker's ping (public/sw-takeover.js), so the worker leaves it to do that itself, and it
 * asks for a worker update when it becomes visible again and every 30 minutes.
 */
export function startNewBuildWatch(): void {
  const sw = typeof navigator !== "undefined" && "serviceWorker" in navigator ? navigator.serviceWorker : undefined;
  if (sw) {
    sw.addEventListener("message", (e: MessageEvent) => {
      if ((e.data as { type?: unknown } | null)?.type === "pls-build-ping") e.ports[0]?.postMessage("pls-build-pong");
    });
    sw.startMessages();
    void sw.ready.then((reg) => {
      const check = () => void reg.update().catch(() => undefined);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
      setInterval(check, UPDATE_EVERY_MS);
    });
  }
  watchForNewBuild({
    sw,
    reload: () => location.reload(),
    unsaved: () => hasUnsavedText(Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"), (el) => ({ type: el instanceof HTMLTextAreaElement ? "textarea" : el.type, value: el.value }))),
    ask: () => {
      const bar = document.createElement("p");
      bar.className = "new-build";
      bar.setAttribute("role", "status");
      bar.append("A new version of this page is ready. ");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.textContent = "Reload";
      btn.addEventListener("click", () => location.reload());
      bar.append(btn);
      document.body.append(bar);
    },
  });
}
