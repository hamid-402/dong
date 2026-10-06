/**
 * Query prefixes for Universal Finder / directory search.
 * Example: `گ:دوستان` → only group spaces matching «دوستان».
 */

import type { DirectorySpaceKind } from "@/lib/workspace-directory-model";

export type DirectoryQueryScope =
  | { kind: "all"; text: string }
  | { kind: "spaces"; text: string }
  | { kind: "pages"; text: string }
  | { kind: "spaceKind"; spaceKind: DirectorySpaceKind; text: string };

const KIND_PREFIX: Record<string, DirectorySpaceKind> = {
  "گ": "group",
  "س": "building",
  "ش": "org",
  "پ": "personal",
  g: "group",
  b: "building",
  o: "org",
  p: "personal",
};

/**
 * Parse optional finder prefixes:
 * - `گ:` / `س:` / `ش:` / `پ:` → space kind
 * - `فضا:` → workspaces only
 * - `صفحه:` → workspace pages / actions only
 */
export function parseDirectoryQuery(raw: string): DirectoryQueryScope {
  const trimmed = raw.trim();
  const match = /^([^\s:]+)\s*:\s*(.*)$/u.exec(trimmed);
  if (!match) return { kind: "all", text: trimmed };

  const prefix = match[1]!.toLowerCase();
  const text = match[2]!.trim();
  if (prefix === "فضا" || prefix === "space" || prefix === "ws") {
    return { kind: "spaces", text };
  }
  if (prefix === "صفحه" || prefix === "page" || prefix === "nav") {
    return { kind: "pages", text };
  }
  const spaceKind = KIND_PREFIX[prefix] ?? KIND_PREFIX[match[1]!];
  if (spaceKind) return { kind: "spaceKind", spaceKind, text };
  return { kind: "all", text: trimmed };
}
