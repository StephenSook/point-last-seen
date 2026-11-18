import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";
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
      // Offline after one visit (spec 6.3, release gate): Workbox precaches the app shell, the MapLibre
      // worker and the icon. version.json is left out on purpose: the online check must reach the network.
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: "script-defer",
        includeManifestIcons: false, // the icon is already in the precache glob
        manifest: {
          name: "Point Last Seen command post",
          short_name: "Point Last Seen",
          start_url: "/",
          display: "standalone",
          background_color: "#110F0D",
          theme_color: "#110F0D",
          icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
        },
        workbox: {
          // pmtiles: the site basemap, fetched whole, so it is cached like any file and drawn offline.
          globPatterns: ["**/*.{js,mjs,css,html,svg,woff2,pmtiles}"],
          // The main bundle (Firebase plus MapLibre) is about 2.1 MB, above Workbox's 2 MiB default.
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/__\//, /^\/pack\//, /^\/evidence\//],
          clientsClaim: true,
          skipWaiting: true,
          cleanupOutdatedCaches: true,
        },
      }),
      versionFilePlugin({
        sha: () => process.env["GITHUB_SHA"] ?? git("rev-parse", "HEAD"),
        dirty: () => git("status", "--porcelain").trim() !== "",
        now: () => new Date(),
      }),
    ],
    build: { target: "es2023", sourcemap: true },
  };
});
