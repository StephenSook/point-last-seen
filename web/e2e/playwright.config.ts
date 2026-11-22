import { readdirSync, readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { AUTH_STATE } from "./authState";

// Every check that joins or names the shared test drill (joinCommand, PLS_SMOKE_INCIDENT) runs in one project with a
// single worker: run side by side, one check's report became another's "newest report" and failed it, so a red run
// did not always mean a real failure. Found from each spec's text, so a new drill check is serial from its first run.
const here = new URL(".", import.meta.url);
const drillNames = readdirSync(here)
  .filter((f) => f.endsWith(".spec.ts") && /joinCommand\(|PLS_SMOKE_INCIDENT/.test(readFileSync(new URL(f, here), "utf8")));
// Top-level e2e files only (Playwright matches the absolute path), never a harness or extras spec with the same name.
const DRILL_SPECS = new RegExp(`/e2e/(?:${drillNames.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`);
const HARNESS_SPECS = ["harness/**", "extras/**"];

const deployed = process.env["BASE_URL"];

export default defineConfig({
  testDir: ".",
  // Harness specs need the dev server: e2e/harness.config.ts runs harness/**, and the
  // extras lane's e2e/extras.config.ts runs extras/**.
  testIgnore: HARNESS_SPECS,
  // Checks about the placeholder-key build run only in the no-backend run (ci.config.ts); this runner serves real keys.
  // A check tagged @quota starts a real practice search, one of the 50 a UTC day the judges have, so it runs only with
  // PLS_ALLOW_QUOTA=1: once per hosting deploy, never in a loop (src/practiceQuota.test.ts holds every start to this).
  grepInvert: process.env["PLS_ALLOW_QUOTA"] === "1" ? /@placeholder-build/ : /@placeholder-build|@quota/,
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: deployed ?? "http://127.0.0.1:4173",
    // Off on purpose: a trace records the App Check debug-token exchange bodies (the secret and the issued token).
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/, use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    {
      name: "chrome",
      dependencies: ["setup"],
      // A project's testIgnore replaces the config's, so it names the harness and extras specs again.
      testIgnore: [...HARNESS_SPECS, DRILL_SPECS],
      use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 }, storageState: AUTH_STATE },
    },
    {
      name: "chrome-drill",
      dependencies: ["setup"],
      testMatch: DRILL_SPECS,
      workers: 1,
      use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 }, storageState: AUTH_STATE },
    },
  ],
  // Without BASE_URL the tests run against a local preview of web/dist (run `npm run build -w web` first).
  webServer: deployed
    ? undefined
    : { command: "npx vite preview --host 127.0.0.1 --port 4173 --strictPort", cwd: "..", url: "http://127.0.0.1:4173", reuseExistingServer: false },
});
