import { defineConfig, devices } from "@playwright/test";

// The pull-request job: browser checks that need no Firebase backend, run against a build made
// with placeholder config (CI has no keys). Tests opt in with the "@no-backend" tag.
export default defineConfig({
  testDir: ".",
  testIgnore: ["harness/**", "extras/**"],
  grep: /@no-backend/,
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: "line",
  use: { baseURL: "http://127.0.0.1:4173", trace: "off", video: "off", screenshot: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  // PLS_PREVIEW_DIR: preview a build kept elsewhere (the local mirror builds the placeholder web into a
  // temporary folder so a real web/dist is never overwritten). Unset in CI: the job previews web/dist.
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port 4173 --strictPort${process.env["PLS_PREVIEW_DIR"] ? ` --outDir ${JSON.stringify(process.env["PLS_PREVIEW_DIR"])}` : ""}`,
    cwd: "..",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
});
