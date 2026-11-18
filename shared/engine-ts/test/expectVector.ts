// The one vector comparer (plan Global Constraints): number leaves within 1e-12
// relative (absolute when the expected value is exactly 0); strings, booleans,
// null, array order and object key sets exact.
const TOL = 1e-12;

export class VectorMismatch extends Error {}

function fail(path: string, msg: string): never {
  throw new VectorMismatch(`${path || "<root>"}: ${msg}`);
}

function compare(actual: unknown, expected: unknown, path: string): void {
  if (expected === null) {
    if (actual !== null) fail(path, `expected null, got ${JSON.stringify(actual)}`);
    return;
  }
  if (typeof expected === "number") {
    if (typeof actual !== "number" || !Number.isFinite(actual)) fail(path, `expected number ${expected}, got ${String(actual)}`);
    const bound = expected === 0 ? TOL : TOL * Math.abs(expected);
    if (Math.abs(actual - expected) > bound) fail(path, `expected ${expected}, got ${actual}`);
    return;
  }
  if (typeof expected === "string" || typeof expected === "boolean") {
    if (actual !== expected) fail(path, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    return;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) fail(path, "expected array");
    if (actual.length !== expected.length) fail(path, `expected length ${expected.length}, got ${actual.length}`);
    expected.forEach((e, i) => compare(actual[i], e, `${path}[${i}]`));
    return;
  }
  if (typeof expected === "object") {
    if (typeof actual !== "object" || actual === null || Array.isArray(actual)) fail(path, "expected object");
    const a = Object.keys(actual).sort();
    const e = Object.keys(expected).sort();
    if (a.join("\u0000") !== e.join("\u0000")) fail(path, `expected keys [${e.join(", ")}], got [${a.join(", ")}]`);
    for (const k of e) compare((actual as Record<string, unknown>)[k], (expected as Record<string, unknown>)[k], `${path}.${k}`);
    return;
  }
  fail(path, `unsupported expected value ${String(expected)}`);
}

export function expectVector(actual: unknown, expected: unknown): void {
  compare(actual, expected, "");
}
