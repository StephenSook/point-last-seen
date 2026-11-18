import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { versionFilePlugin } from "./src/buildinfo/versionFile";
import { readEnv } from "./src/firebaseConfig";

const envDir = fileURLToPath(new URL("..", import.meta.url));
const git = (...args: string[]) => execFileSync("git", args, { cwd: envDir, encoding: "utf8" });

export default defineConfig(({ command, mode }) => {
  // A production build fails here when any Firebase value or the App Check site key is missing.
  if (command === "build") readEnv(loadEnv(mode, envDir, "VITE_"));
  return {
    envDir,
    plugins: [
      react(),
      versionFilePlugin({
        sha: () => process.env["GITHUB_SHA"] ?? git("rev-parse", "HEAD"),
        dirty: () => git("status", "--porcelain").trim() !== "",
        now: () => new Date(),
      }),
    ],
    build: { target: "es2023", sourcemap: true },
  };
});
