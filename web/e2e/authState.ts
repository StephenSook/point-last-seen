import { fileURLToPath } from "node:url";

/**
 * Where the run's one signed-in session is saved (e2e/.auth, gitignored). Not under test-results,
 * which Playwright empties at the start of every run.
 */
export const AUTH_STATE = fileURLToPath(new URL("./.auth/state.json", import.meta.url));
