/** Shared localStorage key for active workspace selection. */
export const WORKSPACE_STORAGE_KEY = "dang.activeWorkspaceId";

export function readStoredWorkspaceId(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeStoredWorkspaceId(id: string) {
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

/** Extract `/w/[slug]` from a pathname. */
export function slugFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/w\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
