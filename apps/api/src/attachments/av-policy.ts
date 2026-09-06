import type { QuarantineStatus } from "@dang/contracts";

/**
 * Fail-closed AV gate for OCR.
 * OCR may run only when quarantine is clean (or still pending before a scan).
 * Never start OCR when status is blocked or error.
 */
export function mayStartOcr(
  quarantineStatus: QuarantineStatus | undefined,
): boolean {
  return quarantineStatus !== "blocked" && quarantineStatus !== "error";
}
