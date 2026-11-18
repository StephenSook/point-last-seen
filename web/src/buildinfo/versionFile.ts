// Build plugin: writes dist/version.json with the commit the bundle was built
// from, so a smoke test can prove the live site serves that commit.

import type { Plugin } from "vite";

type VersionDeps = {
  sha: () => string;
  dirty: () => boolean;
  now: () => Date;
};

export function versionFilePlugin(deps: VersionDeps): Plugin {
  return {
    name: "pls-version-file",
    apply: "build",
    generateBundle() {
      const commit = deps.sha().trim();
      if (!/^[0-9a-f]{40}$/.test(commit)) {
        throw new Error(`version.json needs the full 40-character commit SHA, got "${commit}"`);
      }
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ commit, dirty: deps.dirty(), builtAt: deps.now().toISOString() }),
      });
    },
  };
}
