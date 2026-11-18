// navigator.onLine can say true with no working route (a captive portal, a
// dead uplink at the trailhead). We count the network as up only when a small
// request to our own origin answers in time.

type OnlineDeps = {
  onLine: boolean;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
};

export async function checkOnline({ onLine, fetch, timeoutMs = 4000 }: OnlineDeps): Promise<boolean> {
  if (!onLine) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const ask = fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" }).then(
    (r) => r.ok,
    () => false,
  );
  try {
    return await Promise.race([ask, late]);
  } finally {
    clearTimeout(timer);
  }
}
