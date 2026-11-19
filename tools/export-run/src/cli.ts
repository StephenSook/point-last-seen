// npm run export -w tools/export-run -- --incident <id> --out <file> [--project <id>] [--run-id <id>] [--label <text>]
// Writes the public run only when every check passes; otherwise prints each breach and exits 1 without writing.
import { writeFileSync } from "node:fs";
import { checkRun } from "./check";
import { readIncident } from "./firestore";
import { toPublishedRun } from "./transform";

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main(): Promise<number> {
  const incidentId = flag("--incident"), out = flag("--out");
  if (!incidentId || !out) {
    console.error("usage: export --incident <id> --out <file> [--project <id>] [--run-id <id>] [--label <text>]");
    return 2;
  }
  const project = flag("--project") ?? "buildhybridai-2026-yg3m";
  const raw = await readIncident(project, incidentId);
  const exportedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const label = flag("--label") ?? String(raw.incident.drillLabel ?? "Training drill. Nobody is missing.");
  const run = toPublishedRun(raw, { runId: flag("--run-id") ?? `${incidentId}-${exportedAt.slice(0, 10)}`, label, exportedAt });
  const problems = checkRun(run);
  if (problems.length > 0) {
    for (const p of problems) console.error(`export-run: REFUSED: ${p}`);
    return 1;
  }
  writeFileSync(out, JSON.stringify(run, null, 2) + "\n");
  console.log(`export-run: wrote ${out}: ${run.segments.length} segments, ${run.events.length} events, ${run.plans.length} plans, `
    + `${run.devices.length} devices; every check passed`);
  return 0;
}

main().then(code => process.exit(code), (e: unknown) => { console.error(`export-run: ${String(e)}`); process.exit(1); });
