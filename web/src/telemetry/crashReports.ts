// The page's crash reports: errorReport.ts wired to this window, the default Firebase app and the Crashlytics SDK,
// which is loaded (and its code downloaded) only when the first uncaught error happens.

import { getApps } from "firebase/app";
import { startErrorReports, type ErrorReportDeps } from "./errorReport";

export function crashReportDeps(target: ErrorReportDeps["target"], origin: string): ErrorReportDeps {
  return {
    target,
    origin,
    app: () => getApps().find((a) => a.name === "[DEFAULT]"),
    load: async () => {
      const { getCrashlytics, recordError } = await import("firebase/crashlytics");
      return { getCrashlytics, recordError };
    },
    appVersion: typeof __PLS_COMMIT__ === "string" ? __PLS_COMMIT__ : undefined,
  };
}

export function startCrashReports(): () => void {
  return startErrorReports(crashReportDeps(window, location.origin));
}
