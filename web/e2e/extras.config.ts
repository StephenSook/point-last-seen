import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:5176";

export default defineConfig({
  testDir: "./extras",
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL, trace: "off", video: "off", screenshot: "off" },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: "npx vite --host 127.0.0.1 --port 5176 --strictPort",
    cwd: "..",
    url: `${baseURL}/extras-harness/dock.html`,
    reuseExistingServer: false,
  },
});
