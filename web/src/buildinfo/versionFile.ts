// Build plugin: writes dist/version.json with the commit the bundle was built
// from, so a smoke test can prove the live site serves that commit. The bundle
// gets the same commit as __PLS_COMMIT__, so a crash report names the release
// /version.json names.

import type { Plugin } from "vite";

type VersionDeps = {
  sha: () => string;
  dirty: () => boolean;
  now: () => Date;
};

export function versionFilePlugin(deps: VersionDeps): Plugin {
  let commit: string | undefined;
  // Read once, so version.json and the bundle cannot name two different commits.
  const read = (): string => {
    if (commit !== undefined) return commit;
    const sha = deps.sha().trim();
    if (!/^[0-9a-f]{40}$/.test(sha)) {
      throw new Error(`version.json needs the full 40-character commit SHA, got "${sha}"`);
    }
    commit = sha;
    return commit;
  };
  return {
    name: "pls-version-file",
    apply: "build",
    config: () => ({ define: { __PLS_COMMIT__: JSON.stringify(read()) } }),
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ commit: read(), dirty: deps.dirty(), builtAt: deps.now().toISOString() }),
      });
    },
  };
}
