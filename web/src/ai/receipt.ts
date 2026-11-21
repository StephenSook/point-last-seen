// "What ran" for one AI result: what was asked for, where it ran as the SDK reported it, how long it took, the model,
// and how much left this laptop. It never repeats a prompt, a note or a photo. Every read also sends one timing
// record with its route (web/src/telemetry/trace.ts, docs/SECURITY.md), so "no text or image" is the claim, not
// "nothing".

import type { RouteRecord } from "@pls/engine";

const bytes = (n: number) => `${n.toLocaleString("en-US")} bytes`;

/** The time a read took, in seconds: "2.6 s", or "under 0.1 s". */
function seconds(ms: number): string {
  return ms < 100 ? "under 0.1 s" : `${(ms / 1000).toFixed(1)} s`;
}

export function receiptLines(r: { asked: string; route: RouteRecord; sentBytes: number; what: string }): string[] {
  const { route } = r;
  if (route.path === "rules") return ["No model was asked: fixed wording from code.", "Sent: no text or image."];
  const ran =
    route.path === "on_device" ? (route.sdkReported ? "Ran: on this laptop (reported by the SDK)." : "Ran: on this laptop.")
    : route.path === "cloud" ? (route.sdkReported ? "Ran: in the cloud (reported by the SDK)." : "Ran: in the cloud.")
    : "Ran: not reported by the SDK.";
  const timed = (route.path === "on_device" || route.path === "cloud") && Number.isFinite(route.latencyMs) && route.latencyMs >= 0;
  const sent =
    route.path === "on_device" ? "Sent: no text or image left this laptop."
    : route.path === "cloud" ? `Sent: ${bytes(r.sentBytes)} of ${r.what}.`
    : `Sent: up to ${bytes(r.sentBytes)} of ${r.what}, if it ran in the cloud.`;
  return [`Asked for: ${r.asked}.`, ran, ...(timed ? [`Took: ${seconds(route.latencyMs)}.`] : []), `Model: ${route.model}.`, sent];
}
