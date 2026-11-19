// The output cap every direct cloud call sends. It equals the before-generate guard's text cap
// (functions/src/cloudGuard.ts MAX_OUTPUT_TOKENS; limits.test.ts fails if they differ). The guard
// rewrites a request to its cap only below its media size limit; above it a request passes as sent,
// so a large clip read must carry the cap itself. Template calls are not covered: each template sets its own.
export const CLOUD_MAX_OUTPUT_TOKENS = 2048;
