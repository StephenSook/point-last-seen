import { ref, uploadBytes } from "firebase/storage";
import { afterAll, describe, it } from "vitest";
import { assertFails, assertSucceeds, closeClients, commandClaims, familyClaims, searcherClaims, storageAs } from "../helpers";

const SHA = "a".repeat(64);
const bytes = (n: number) => new Uint8Array(n);

afterAll(closeClients);

describe("storage rules (spec section 7)", () => {
  it("a 15,000,000-byte clip upload is denied; a 13,000,000-byte one is allowed", async () => {
    const st = storageAs("family-uid", familyClaims);
    await assertFails(uploadBytes(ref(st, `clips/I1/${SHA}.mp4`), bytes(15_000_000), { contentType: "video/mp4" }));
    await assertSucceeds(uploadBytes(ref(st, `clips/I1/${SHA}.mp4`), bytes(13_000_000), { contentType: "video/mp4" }));
  });
  it("a clip must be video and land under the member's own incident", async () => {
    const st = storageAs("family-uid", familyClaims);
    await assertFails(uploadBytes(ref(st, `clips/I1/${SHA}.mp4`), bytes(1000), { contentType: "text/plain" }));
    await assertFails(uploadBytes(ref(st, `clips/I2/${SHA}.mp4`), bytes(1000), { contentType: "video/mp4" }));
    await assertFails(uploadBytes(ref(storageAs(null), `clips/I1/${SHA}.mp4`), bytes(1000), { contentType: "video/mp4" }));
  });
  it("photos are JPEG of at most 2 MB, written by command or family", async () => {
    await assertSucceeds(uploadBytes(ref(storageAs("command-uid", commandClaims), `photos/I1/${SHA}.jpg`), bytes(1_500_000), { contentType: "image/jpeg" }));
    await assertFails(uploadBytes(ref(storageAs("command-uid", commandClaims), `photos/I1/${SHA}.jpg`), bytes(2_500_000), { contentType: "image/jpeg" }));
    await assertFails(uploadBytes(ref(storageAs("searcher-uid", searcherClaims), `photos/I1/${SHA}.jpg`), bytes(1000), { contentType: "image/jpeg" }));
  });
  it("no client writes packs", async () => {
    await assertFails(uploadBytes(ref(storageAs("command-uid", commandClaims), "packs/I1/T1-v1.bundle"), bytes(10), { contentType: "application/octet-stream" }));
  });
});
