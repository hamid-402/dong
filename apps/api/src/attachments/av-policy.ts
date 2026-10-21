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

/**
 * Download serves *stored* quarantine status only — never re-scan.
 * Previously clean attachments stay downloadable when ClamAV is down.
 * Blocked malware is not served; error/pending/scanning use stored bytes as-is.
 */
export function mayServeStoredAttachment(
  quarantineStatus: QuarantineStatus | undefined,
): boolean {
  return quarantineStatus !== "blocked";
}

/** Download path must never invoke AV; fail-closed applies to new uploads only. */
export function downloadRequiresAvRescan(): false {
  return false;
}
