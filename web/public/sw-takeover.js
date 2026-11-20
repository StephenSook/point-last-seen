// Loaded into the generated service worker (Workbox importScripts). When a new deploy's worker activates, a
// page still running an older build may have no code that listens for it, and would keep showing the old build
// until a manual reload. So the worker takes control of every open page and asks each one "which build are
// you?". Pages from this build on answer (src/pwa/takeover.ts) and reload themselves, or ask first while
// someone is typing. A page that does not answer is an older build, and the worker cannot see whether someone is
// typing in it, so it loads the page's own address again only when it is the focused page and this worker began
// installing less than a minute ago: the update was set off by that page just opening, as on a judge's first visit.
// Any other unanswering page, including one in a background tab where a note may be half written, is left as it is
// and gets the new build on its next load. On a first install there is no older build at all (the page came from
// the network), so nothing is reloaded: a page that is slow to answer is only busy.

const RECENT_MS = 60 * 1000;
let installStartedAt = 0;
// Whether an older worker was active when this one began installing: only then can an open page be an older build.
let replacesOlder = false;

self.addEventListener("install", () => {
  installStartedAt = Date.now();
  replacesOlder = Boolean(self.registration && self.registration.active);
});

function answers(page) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), 1000);
    channel.port1.onmessage = () => {
      clearTimeout(timer);
      resolve(true);
    };
    page.postMessage({ type: "pls-build-ping" }, [channel.port2]);
  });
}

const reload = (page) => page.navigate(page.url).catch(() => undefined);

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const pages = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const justOpened = Date.now() - installStartedAt < RECENT_MS;
      await Promise.all(
        pages.map(async (page) => {
          if (await answers(page)) return;
          if (!("navigate" in page)) return;
          // Not awaited: the reload's own request waits until this worker has finished activating.
          if (replacesOlder && page.focused && justOpened) void reload(page);
        }),
      );
    })(),
  );
});
