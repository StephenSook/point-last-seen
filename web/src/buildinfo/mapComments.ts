// Build plugin: a script copied into the build as-is (the MapLibre worker, imported with ?url) keeps the
// `//# sourceMappingURL=` comment its package shipped. The site serves no source maps, so that comment is removed.
// Chunks Vite builds itself carry no comment: build.sourcemap is "hidden".

import type { Plugin } from "vite";

const COMMENT = /^\/\/# sourceMappingURL=.*$/gm;

export function stripMapCommentsPlugin(): Plugin {
  return {
    name: "pls-strip-map-comments",
    apply: "build",
    generateBundle(_options, bundle) {
      for (const out of Object.values(bundle)) {
        if (out.type !== "asset" || !/\.m?js$/.test(out.fileName)) continue;
        const text = typeof out.source === "string" ? out.source : new TextDecoder().decode(out.source);
        if (!COMMENT.test(text)) continue;
        COMMENT.lastIndex = 0;
        const stripped = text.replace(COMMENT, "");
        out.source = typeof out.source === "string" ? stripped : new TextEncoder().encode(stripped);
      }
    },
  };
}
