import { describe, expect, it } from "vitest";
import { stripMapCommentsPlugin } from "./mapComments";

type Out = { type: "asset" | "chunk"; fileName: string; source?: string | Uint8Array; code?: string };

function run(bundle: Record<string, Out>) {
  const hook = stripMapCommentsPlugin().generateBundle as unknown as (this: unknown, o: unknown, b: Record<string, Out>) => void;
  hook.call({}, {}, bundle);
  return bundle;
}

describe("stripMapCommentsPlugin", () => {
  it("removes a source map comment from a copied script, as text or as bytes", () => {
    const text = "export{a};\n//# sourceMappingURL=maplibre-gl-worker.mjs.map";
    const b = run({
      a: { type: "asset", fileName: "assets/maplibre-gl-worker-x.mjs", source: text },
      b: { type: "asset", fileName: "assets/other-x.js", source: new TextEncoder().encode(`${text}\n`) },
    });
    expect(b["a"]!.source).toBe("export{a};\n");
    expect(new TextDecoder().decode(b["b"]!.source as Uint8Array)).toBe("export{a};\n\n");
  });

  it("leaves chunks, other files and scripts without a comment alone", () => {
    const chunk: Out = { type: "chunk", fileName: "assets/main-x.js", code: "x\n//# sourceMappingURL=main-x.js.map" };
    const css: Out = { type: "asset", fileName: "assets/main-x.css", source: "a{}\n/*# sourceMappingURL=main-x.css.map */" };
    const plain = new TextEncoder().encode("export{};");
    const js: Out = { type: "asset", fileName: "sw-takeover.js", source: plain };
    run({ chunk, css, js });
    expect(chunk.code).toBe("x\n//# sourceMappingURL=main-x.js.map");
    expect(css.source).toBe("a{}\n/*# sourceMappingURL=main-x.css.map */");
    expect(js.source).toBe(plain);
  });
});
