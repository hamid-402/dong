/**
 * Pen-test engagement honesty (R10-22).
 * prep_ready = threat model+scope+inventory done; not a passed pen-test.
 * engaged / remediating / closed come from PENTEST_STATUS env only.
 */
export type PenTestEngagementStatus =
  | "prep_ready"
  | "engaged"
  | "remediating"
  | "closed";

export function resolvePenTestEngagementStatus(
  env: Record<string, string | undefined> = process.env,
): PenTestEngagementStatus {
  const raw = (env.PENTEST_STATUS ?? "").trim().toLowerCase();
  if (raw === "engaged" || raw === "in_progress") return "engaged";
  if (raw === "remediating" || raw === "remediation") return "remediating";
  if (raw === "closed" || raw === "closed_with_exceptions") return "closed";
  return "prep_ready";
}
