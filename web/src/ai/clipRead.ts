// The camera clip read (spec section 12.1): one staged clip, sent inline to the cloud model
// only after its three required consents, read into the shared CameraSighting shape. Code,
// not the model, decides the bearing and the last-seen time.

import { InferenceMode, type HybridParams, type Part } from "firebase/ai";
import clipSchema from "../../../shared/schemas/camera-sighting.schema.json";

const P = clipSchema.properties;
const mmss = (description: string) => ({ type: "string", pattern: P.firstSeen.pattern, description }) as const;

/** The shared CameraSighting schema as the model's response schema (closed lists and caps from the shared file). */
export const CAMERA_SIGHTING_JSON = {
  type: "object",
  properties: {
    personVisible: { type: "boolean" },
    firstSeen: mmss("MM:SS from the clip start when the person first appears"),
    lastSeen: mmss("MM:SS from the clip start when the person is last visible"),
    entryEdge: { type: "string", enum: P.entryEdge.enum },
    exitEdge: { type: "string", enum: P.exitEdge.enum, description: "the frame edge they leave by, or the direction they walk" },
    topColor: { type: "string", enum: P.topColor.enum },
    bottomColor: { type: "string", enum: P.bottomColor.enum },
    topType: { type: "string", maxLength: P.topType.maxLength },
    footwear: { type: "string", maxLength: P.footwear.maxLength },
    headwear: { type: "string", maxLength: P.headwear.maxLength },
    carriedItems: { type: "array", maxItems: P.carriedItems.maxItems, items: { type: "string" } },
    keyFrame: {
      type: "object",
      properties: {
        time: mmss("MM:SS of the clearest frame"),
        box2d: { type: "array", minItems: 4, maxItems: 4, items: { type: "integer", minimum: 0, maximum: 1000 }, description: "[yMin, xMin, yMax, xMax] on a 0 to 1000 scale" },
      },
      required: P.keyFrame.required,
    },
    lighting: { type: "string", enum: P.lighting.enum },
    legibility: { type: "string", enum: P.legibility.enum },
    evidence: { type: "string", maxLength: P.evidence.maxLength, description: "one sentence on what is visible" },
  },
  required: clipSchema.required,
} as const;

/** The same instruction the Android family app sends with a clip. */
export const CLIP_PROMPT =
  "This is a short home-camera clip from a training drill. Describe one adult walking through the view: " +
  "when they first and last appear, which frame edge they enter and leave by (toward_camera or " +
  "away_from_camera when they walk along the view), their clothing colors from the closed list, " +
  "what they carry, the clearest frame with a box around the person, the lighting, and how legible the clip is. " +
  "Do not describe the face. Do not guess who the person is. Use unknown when you cannot tell.";

/** Cloud only (ONLY_IN_CLOUD): a clip is never read on this laptop's model. */
export function clipCloudParams(model: string): HybridParams {
  return {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: { model, generationConfig: { responseMimeType: "application/json", responseJsonSchema: CAMERA_SIGHTING_JSON } },
  };
}

/** The request: the clip inline with its own type, then the prompt. */
export function clipParts(base64: string, mimeType: string): Part[] {
  return [
    { type: "inlineData", inlineData: { mimeType, data: base64 } },
    { type: "text", text: CLIP_PROMPT },
  ];
}
