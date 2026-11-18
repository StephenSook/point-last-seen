import { describe, expect, it } from "vitest";
import { InferenceMode } from "firebase/ai";
import shared from "../../../shared/schemas/camera-sighting.schema.json";
import { CAMERA_SIGHTING_JSON, CLIP_PROMPT, clipCloudParams, clipParts } from "./clipRead";

describe("clip read parameters", () => {
  it("reads only in the cloud, with the clip schema", () => {
    const p = clipCloudParams("gemini-3.5-flash-lite");
    expect(p.mode).toBe(InferenceMode.ONLY_IN_CLOUD);
    expect(p.inCloudParams?.model).toBe("gemini-3.5-flash-lite");
    expect(p.inCloudParams?.generationConfig).toMatchObject({ responseMimeType: "application/json", responseJsonSchema: CAMERA_SIGHTING_JSON });
  });

  it("asks for every field of the shared CameraSighting schema, with the same closed lists and caps", () => {
    expect(CAMERA_SIGHTING_JSON.required).toEqual(shared.required);
    expect(Object.keys(CAMERA_SIGHTING_JSON.properties).sort()).toEqual(Object.keys(shared.properties).sort());
    const P = CAMERA_SIGHTING_JSON.properties;
    const S = shared.properties;
    for (const k of ["entryEdge", "exitEdge", "topColor", "bottomColor", "lighting", "legibility"] as const) expect(P[k].enum).toEqual(S[k].enum);
    for (const k of ["topType", "footwear", "headwear", "evidence"] as const) expect(P[k].maxLength).toBe(S[k].maxLength);
    expect(P.carriedItems.maxItems).toBe(S.carriedItems.maxItems);
    expect(P.keyFrame.required).toEqual(S.keyFrame.required);
    expect(P.keyFrame.properties.box2d).toMatchObject({ minItems: 4, maxItems: 4 });
  });

  it("tells the model not to describe the face or guess who the person is", () => {
    expect(CLIP_PROMPT).toContain("Do not describe the face.");
    expect(CLIP_PROMPT).toContain("Do not guess who the person is.");
  });

  it("sends the clip inline with its own type, then the prompt", () => {
    expect(clipParts("AAAA", "video/quicktime")).toEqual([
      { type: "inlineData", inlineData: { mimeType: "video/quicktime", data: "AAAA" } },
      { type: "text", text: CLIP_PROMPT },
    ]);
  });
});
