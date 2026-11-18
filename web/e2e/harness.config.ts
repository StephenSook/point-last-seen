import { defineConfig, devices } from "@playwright/test";

// Component harnesses served by the Vite dev server (they are not in the production build).
export default defineConfig({
  testDir: "./harness",
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:5175", trace: "off", video: "off", screenshot: "off" },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1280, height: 800 } } }],
  webServer: { command: "npx vite --host 127.0.0.1 --port 5175 --strictPort", cwd: "..", url: "http://127.0.0.1:5175/harness/map.html", reuseExistingServer: false },
});
