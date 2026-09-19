const STORAGE_KEY = "dang-recent-destinations";
const MAX_RECENT = 6;

export type RecentDestination = {
  key: string;
  label: string;
  href: string;
  visitedAt: string;
};

function readAll(): RecentDestination[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is RecentDestination => {
      if (!row || typeof row !== "object") return false;
      const item = row as RecentDestination;
      return (
        typeof item.key === "string" &&
        typeof item.label === "string" &&
        typeof item.href === "string" &&
        typeof item.visitedAt === "string"
      );
    });
  } catch {
    return [];
  }
}

export function listRecentDestinations(limit = MAX_RECENT): RecentDestination[] {
  return readAll().slice(0, limit);
}

/** Record a real navigation target — used by mosaic tiles (not decorative). */
export function rememberDestination(input: {
  key: string;
  label: string;
  href: string;
}): RecentDestination[] {
  if (typeof window === "undefined") return [];
  const next: RecentDestination = {
    key: input.key,
    label: input.label,
    href: input.href,
    visitedAt: new Date().toISOString(),
  };
  const rest = readAll().filter(
    (row) => row.href !== next.href && row.key !== next.key,
  );
  const merged = [next, ...rest].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    /* ignore */
  }
  return merged;
}
