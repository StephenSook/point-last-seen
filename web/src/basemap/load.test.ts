import { describe, expect, it } from "vitest";
import { loadBasemap } from "./load";

const MAGIC = [0x50, 0x4d, 0x54, 0x69, 0x6c, 0x65, 0x73, 0x03]; // "PMTiles" then spec version 3
const respond = (body: BodyInit, status = 200, type = "application/octet-stream") => async () => new Response(body, { status, headers: { "content-type": type } });

describe("loadBasemap", () => {
  it("accepts a PMTiles v3 file and keys it by its file name", async () => {
    const r = await loadBasemap("/tiles/piedmont-park-dev.pmtiles", respond(new Uint8Array([...MAGIC, 0, 0, 0])));
    expect(r.state).toBe("ok");
    if (r.state === "ok") expect(r.key).toBe("piedmont-park-dev.pmtiles");
  });

  it("reads a missing file as absent: a 404, or the app's HTML from the hosting rewrite", async () => {
    expect((await loadBasemap("/tiles/x.pmtiles", respond("", 404))).state).toBe("absent");
    expect((await loadBasemap("/tiles/x.pmtiles", respond("<!doctype html>", 200, "text/html"))).state).toBe("absent");
  });

  it("refuses a file that is not PMTiles v3", async () => {
    expect((await loadBasemap("/tiles/x.pmtiles", respond(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])))).state).toBe("invalid");
    expect((await loadBasemap("/tiles/x.pmtiles", respond(new Uint8Array([...MAGIC.slice(0, 7), 0x02])))).state).toBe("invalid");
  });

  it("reports a failed fetch as unavailable, not as absent", async () => {
    expect((await loadBasemap("/tiles/x.pmtiles", async () => { throw new TypeError("offline"); })).state).toBe("unavailable");
  });
});
