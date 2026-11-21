import { defineConfig, devices } from "@playwright/test";
import { harnessPort } from "./harnessPort";

// PLS_HARNESS_PORT moves the dev server when another worktree is running these at the same time.
const port = harnessPort("PLS_HARNESS_PORT", 5175);
const baseURL = `http://127.0.0.1:${port}`;

// Component harnesses served by the Vite dev server (they are not in the production build).
// On CI runners Playwright's own Chromium runs these (installed by the workflow); locally, desktop Chrome.
export default defineConfig({
  testDir: "./harness",
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL, trace: "off", video: "off", screenshot: "off" },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: process.env["CI"] ? undefined : "chrome", viewport: { width: 1280, height: 800 } } }],
  webServer: { command: `npx vite --host 127.0.0.1 --port ${port} --strictPort`, cwd: "..", url: `${baseURL}/harness/map.html`, reuseExistingServer: false },
});
