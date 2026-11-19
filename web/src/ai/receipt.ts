// "What ran" for one AI result: what was asked for, where it ran as the SDK reported it, the model, and how
// much left this laptop. It never repeats a prompt, a note or a photo.

import type { RouteRecord } from "@pls/engine";

const bytes = (n: number) => `${n.toLocaleString("en-US")} bytes`;

export function receiptLines(r: { asked: string; route: RouteRecord; sentBytes: number; what: string }): string[] {
  const { route } = r;
  if (route.path === "rules") return ["No model was asked: fixed wording from code.", "Sent: nothing."];
  const ran =
    route.path === "on_device" ? (route.sdkReported ? "Ran: on this laptop (reported by the SDK)." : "Ran: on this laptop.")
    : route.path === "cloud" ? (route.sdkReported ? "Ran: in the cloud (reported by the SDK)." : "Ran: in the cloud.")
    : "Ran: not reported by the SDK.";
  const sent =
    route.path === "on_device" ? "Sent: nothing left this laptop."
    : route.path === "cloud" ? `Sent: ${bytes(r.sentBytes)} of ${r.what}.`
    : `Sent: up to ${bytes(r.sentBytes)} of ${r.what}, if it ran in the cloud.`;
  return [`Asked for: ${r.asked}.`, ran, `Model: ${route.model}.`, sent];
}
