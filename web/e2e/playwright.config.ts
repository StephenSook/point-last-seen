import { defineConfig, devices } from "@playwright/test";

const deployed = process.env["BASE_URL"];

export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: deployed ?? "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } } }],
  // Without BASE_URL the tests run against a local preview of web/dist (run `npm run build -w web` first).
  webServer: deployed
    ? undefined
    : { command: "npx vite preview --host 127.0.0.1 --port 4173 --strictPort", cwd: "..", url: "http://127.0.0.1:4173", reuseExistingServer: false },
});
