// The port a browser harness's dev server uses: the named environment variable when set, else the default. Two
// worktrees running the harnesses at once need different ports, because each server is started with --strictPort.
export function harnessPort(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (raw === "") return fallback;
  const port = Number(raw);
  if (!/^\d+$/.test(raw) || port < 1024 || port > 65535) throw new Error(`${name} must be a whole number from 1024 to 65535, not "${raw}".`);
  return port;
}
