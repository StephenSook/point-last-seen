// Dev-server-only measurement page (web/harness/clipread.html): one cloud read of a clip served by
// the dev server, through the production pieces (the live model and prompt in clipCloudGenerator,
// parseCameraSighting, checkSighting, bearingFromExit), with App Check and a signed-in user. It
// writes nothing: no clip record, no upload, no event. For measuring the reader against a truth
// file; it does not record consent, so it is never a path for real clips.

import { bearingFromExit, checkSighting } from "@pls/engine";
import { clipCloudGenerator, aiClient } from "../ai/client";
import { parseCameraSighting } from "../ai/clipRead";
import { RC_DEFAULTS } from "../config/rc";
import { bytesToBase64 } from "../data/photos";
import { ensureSignedIn, getPls } from "../firebase";

Object.assign(window, {
  measureRead: async (clipUrl: string, mimeType: string, durationS: number, facingDeg: number | null) => {
    const p = getPls();
    await ensureSignedIn(p.auth);
    const bytes = new Uint8Array(await (await fetch(clipUrl)).arrayBuffer());
    const generate = clipCloudGenerator(aiClient(p.app, RC_DEFAULTS.use_limited_use_tokens), RC_DEFAULTS.cloud_model_web);
    const t0 = performance.now();
    const reply = await generate(bytesToBase64(bytes), mimeType);
    const ms = Math.round(performance.now() - t0);
    const parsed = parseCameraSighting(reply.text);
    const check = parsed ? checkSighting(parsed, durationS) : null;
    return { bytes: bytes.length, ms, inferenceSource: reply.inferenceSource, parsed, ok: check?.ok ?? false, reasons: check?.reasons ?? ["unreadable_reply"], cleaned: check?.cleaned ?? null, bearingDeg: parsed ? bearingFromExit(facingDeg, parsed.exitEdge) : null };
  },
  ready: true,
});
