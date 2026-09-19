/**
 * Pure RPO math for local WAL archive depth (R10-07).
 * Unit-testable without Docker/Postgres.
 */

/** Default RPO target from QUALITY-AND-DELIVERY §7 (5 minutes). */
export const DEFAULT_RPO_MS = 5 * 60 * 1000;

/**
 * @param {{ mtimeMs: number, name?: string }[]} files
 * @param {{ nowMs?: number, rpoMs?: number }} [opts]
 */
export function evaluateWalArchiveDepth(files, opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  const rpoMs = opts.rpoMs ?? DEFAULT_RPO_MS;
  const usable = (files ?? []).filter(
    (f) => typeof f.mtimeMs === "number" && Number.isFinite(f.mtimeMs),
  );
  if (usable.length === 0) {
    return {
      available: false,
      unavailableReason: "empty_archive",
      fileCount: 0,
      newestAgeMs: null,
      oldestAgeMs: null,
      rpoMs,
      withinRpo: false,
      proven: false,
    };
  }
  const mtimes = usable.map((f) => f.mtimeMs);
  const newest = Math.max(...mtimes);
  const oldest = Math.min(...mtimes);
  const newestAgeMs = Math.max(0, nowMs - newest);
  const oldestAgeMs = Math.max(0, nowMs - oldest);
  const withinRpo = newestAgeMs <= rpoMs;
  return {
    available: true,
    fileCount: usable.length,
    newestAgeMs,
    oldestAgeMs,
    rpoMs,
    withinRpo,
    /** Proven only when archive non-empty and newest segment within RPO. */
    proven: withinRpo,
  };
}

/**
 * Timed restore drill result from wall-clock marks.
 * @param {{ archiveEval: ReturnType<typeof evaluateWalArchiveDepth>, restoreStartedMs: number, restoreFinishedMs: number, verifyOk: boolean }} input
 */
export function evaluateTimedRestoreDrill(input) {
  const durationMs = Math.max(
    0,
    input.restoreFinishedMs - input.restoreStartedMs,
  );
  const { archiveEval, verifyOk } = input;
  const rpoOk = archiveEval.available && archiveEval.proven;
  return {
    ok: Boolean(verifyOk && rpoOk),
    durationMs,
    rpoOk,
    verifyOk: Boolean(verifyOk),
    archive: archiveEval,
  };
}
