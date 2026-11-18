import { describe, expect, it } from "vitest";
import { generatorFor } from "./client";

describe("generatorFor", () => {
  it("returns the reply text and the SDK's reported route", async () => {
    const gen = generatorFor({ generateContent: async () => ({ response: { text: () => "{}", inferenceSource: "in_cloud" } }) });
    expect(await gen("x")).toEqual({ text: "{}", inferenceSource: "in_cloud" });
  });

  it("passes undefined through when the SDK reports no route", async () => {
    const gen = generatorFor({ generateContent: async () => ({ response: { text: () => "{}" } }) });
    expect((await gen("x")).inferenceSource).toBeUndefined();
  });

  it("sends the prompt text as given", async () => {
    let seen = "";
    const gen = generatorFor({ generateContent: async (t: string) => { seen = t; return { response: { text: () => "" } }; } });
    await gen("table");
    expect(seen).toBe("table");
  });
});
