// The trace sink: Firebase Performance Monitoring custom traces. Started on first use.

import type { FirebaseApp } from "firebase/app";
import { getPerformance, trace } from "firebase/performance";
import type { TraceSink } from "./trace";

export function perfSink(app: FirebaseApp): TraceSink {
  const perf = getPerformance(app);
  return { record: (name, startMs, durationMs, options) => trace(perf, name).record(startMs, durationMs, options) };
}
