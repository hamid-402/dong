/**
 * Resolve product links to classic paths.
 * Classic routes redirect to `/w/[slug]/…` (or /account, /spaces) via ClassicToWorkspaceRedirect.
 * Keeps deep links shareable and avoids opaque `/hub/~…` URLs in the product chrome.
 */
export function hubPathFor(pathname: string): string {
  let normalized = pathname.replace(/\/$/, "") || "/";
  if (normalized === "/groups") normalized = "/group";
  return normalized;
}
