/**
 * Primary Shell V2 tab keys — must not reappear as module pills under page titles.
 * OperationsModuleHeader is retired; keep this set for any future strip filters.
 * Finance-family siblings (settlements / invoices / statements / …) stay allowed,
 * including `expenses` when it is an internal section switcher.
 */
export const SHELL_PRIMARY_DESTINATION_KEYS = new Set([
  "home",
  "spaces",
  "space",
  "more",
]);

export function withoutShellPrimaryDestinations<
  T extends { key: string },
>(destinations: T[]): T[] {
  return destinations.filter((d) => !SHELL_PRIMARY_DESTINATION_KEYS.has(d.key));
}
