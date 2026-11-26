import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { gridFilesPlugin } from "./src/buildinfo/gridFiles";
import { stripMapCommentsPlugin } from "./src/buildinfo/mapComments";
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
      // Each site's basemap tiles and route graph, from shared/grid, at tiles/ (the build fails without them).
      gridFilesPlugin({
        gridIds: ["piedmont-park-dev", "kennesaw-mountain-drill"],
        read: (name) => {
          try {
            return new Uint8Array(readFileSync(new URL(`../shared/grid/${name}`, import.meta.url)));
          } catch {
            return null;
          }
        },
      }),
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
          // The extras lane's data files are json under extras/; version.json stays network-only.
          globPatterns: ["**/*.{js,mjs,css,html,svg,woff2,pmtiles}", "extras/**/*.json", "tiles/*.graph.json"],
          // The clip time machine's 3D view (three.js, about 0.9 MB) loads only when a person opens it; it needs the
          // clip from the network anyway, so it is left out of the offline download. Workbox's own default stays.
          globIgnores: ["**/node_modules/**/*", "assets/TimeMachine-*"],
          // The main bundle (Firebase plus MapLibre) is about 2.1 MB, above Workbox's 2 MiB default.
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/__\//, /^\/pack\//, /^\/evidence\//],
          clientsClaim: true,
          skipWaiting: true,
          // On activate, pages still running an older build are moved onto this one (public/sw-takeover.js).
          importScripts: ["sw-takeover.js"],
          cleanupOutdatedCaches: true,
          // The site serves no source maps: no sw.js.map or workbox map, and no comment naming one.
          sourcemap: false,
        },
      }),
      versionFilePlugin({
        sha: () => process.env["GITHUB_SHA"] ?? git("rev-parse", "HEAD"),
        dirty: () => git("status", "--porcelain").trim() !== "",
        now: () => new Date(),
      }),
      stripMapCommentsPlugin(),
    ],
    build: {
      target: "es2023",
      // Maps are written for the Crashlytics upload (predeploy uploads, then deletes them) but no served file names one.
      sourcemap: "hidden",
      // The app, plus two static pages whose text is in the HTML itself (no app script), for a reviewer's fetch.
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL("./index.html", import.meta.url)),
          privacy: fileURLToPath(new URL("./privacy.html", import.meta.url)),
          support: fileURLToPath(new URL("./support.html", import.meta.url)),
        },
      },
    },
  };
});
