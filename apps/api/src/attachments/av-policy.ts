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

export type ServeAttachmentOptions = {
  /** When true (CLAMAV_ENABLED), pending rows are not downloadable. */
  clamavEnabled?: boolean;
};

/**
 * Download serves *stored* quarantine status only — never re-scan.
 * Previously clean attachments stay downloadable when ClamAV is down.
 * Blocked malware and scan-error rows are not served (400 quarantine-blocked).
 * When CLAMAV_ENABLED is off: pending/scanning remain downloadable if a blob exists.
 * When CLAMAV_ENABLED is on: pending is refused (400 quarantine-blocked) until scanned.
 */
export function mayServeStoredAttachment(
  quarantineStatus: QuarantineStatus | undefined,
  options?: ServeAttachmentOptions,
): boolean {
  if (quarantineStatus === "blocked" || quarantineStatus === "error") {
    return false;
  }
  if (options?.clamavEnabled && quarantineStatus === "pending") {
    return false;
  }
  return true;
}

/** New ClamAV upload/scan that failed closed — reject with HTTP 503. */
export function isAvUnavailableScanResult(status: QuarantineStatus): boolean {
  return status === "error";
}

/** Download path must never invoke AV; fail-closed applies to new uploads only. */
export function downloadRequiresAvRescan(): false {
  return false;
}
