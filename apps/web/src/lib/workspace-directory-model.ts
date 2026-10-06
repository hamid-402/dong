/**
 * Pure layout helpers for workspace directory switcher / finder / kind hub.
 * No invented metrics — only membership rows + local pin/recent ids.
 */

import { spaceKindForTemplate, type WorkspaceSummary } from "@dang/contracts";
import { fuzzyScore } from "@/lib/fuzzy-score";
import type { PinnedWorkspace, RecentWorkspace } from "@/lib/workspace-directory-prefs";

export const DIRECTORY_KIND_ORDER = [
  "personal",
  "group",
  "building",
  "org",
] as const;

export type DirectorySpaceKind = (typeof DIRECTORY_KIND_ORDER)[number];

export const DIRECTORY_KIND_LABEL: Record<DirectorySpaceKind, string> = {
  personal: "شخصی",
  group: "گروه",
  building: "ساختمان",
  org: "سازمان",
};

/** Collapse kind accordion when row count exceeds this (without search). */
export const DIRECTORY_ACCORDION_COLLAPSE_AT = 6;
/** Soft virtualize: only mount this many rows until kind is expanded. */
export const DIRECTORY_KIND_VISIBLE_CAP = 15;

export type DirectoryWorkspaceRow = WorkspaceSummary & {
  spaceKind: DirectorySpaceKind;
};

export type DirectorySection =
  | {
      id: "pinned" | "recent";
      label: string;
      rows: DirectoryWorkspaceRow[];
      kind?: undefined;
      collapsed?: undefined;
      hiddenCount?: undefined;
    }
  | {
      id: `kind-${DirectorySpaceKind}`;
      label: string;
      kind: DirectorySpaceKind;
      rows: DirectoryWorkspaceRow[];
      collapsed: boolean;
      hiddenCount: number;
    };

function toRow(ws: WorkspaceSummary): DirectoryWorkspaceRow {
  return {
    ...ws,
    spaceKind: spaceKindForTemplate(ws.template),
  };
}

function matchesQuery(ws: DirectoryWorkspaceRow, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const hay = `${ws.name} ${ws.slug} ${DIRECTORY_KIND_LABEL[ws.spaceKind]}`;
  return fuzzyScore(q, hay) >= 0 || fuzzyScore(q, ws.name) >= 0;
}

function byName(a: DirectoryWorkspaceRow, b: DirectoryWorkspaceRow): number {
  return a.name.localeCompare(b.name, "fa");
}

/**
 * Build ordered sections for the directory switcher.
 * `expandedKinds` overrides auto-collapse when the user opens an accordion.
 */
export function buildDirectorySections(input: {
  workspaces: WorkspaceSummary[];
  query: string;
  pins: PinnedWorkspace[];
  recent: RecentWorkspace[];
  expandedKinds: ReadonlySet<DirectorySpaceKind>;
  /** When set, skip the visible-cap slice for that kind. */
  fullyExpandedKinds?: ReadonlySet<DirectorySpaceKind>;
  /** Kind of the currently active workspace — stays expanded by default. */
  activeKind?: DirectorySpaceKind | null;
}): DirectorySection[] {
  const live = input.workspaces.map(toRow);
  const liveById = new Map(live.map((row) => [row.id, row]));
  const q = input.query.trim();
  const searching = q.length > 0;
  const fullyExpanded = input.fullyExpandedKinds ?? new Set<DirectorySpaceKind>();

  const filtered = searching
    ? live
        .map((row) => ({
          row,
          score: Math.max(
            fuzzyScore(q, row.name),
            fuzzyScore(q, `${row.name} ${row.slug}`),
          ),
        }))
        .filter((item) => item.score >= 0)
        .sort(
          (a, b) =>
            b.score - a.score || a.row.name.localeCompare(b.row.name, "fa"),
        )
        .map((item) => item.row)
    : live;

  const sections: DirectorySection[] = [];

  if (!searching) {
    const pinRows = input.pins
      .map((pin) => liveById.get(pin.workspaceId))
      .filter((row): row is DirectoryWorkspaceRow => Boolean(row));
    if (pinRows.length > 0) {
      sections.push({
        id: "pinned",
        label: "پین‌شده",
        rows: pinRows,
      });
    }

    const pinIds = new Set(pinRows.map((row) => row.id));
    const recentRows = input.recent
      .map((item) => liveById.get(item.workspaceId))
      .filter(
        (row): row is DirectoryWorkspaceRow =>
          Boolean(row) && !pinIds.has(row!.id),
      );
    if (recentRows.length > 0) {
      sections.push({
        id: "recent",
        label: "اخیر",
        rows: recentRows,
      });
    }
  }

  for (const kind of DIRECTORY_KIND_ORDER) {
    const kindRows = filtered
      .filter((row) => row.spaceKind === kind)
      .slice()
      .sort(byName);
    if (kindRows.length === 0) continue;

    const forceExpand =
      searching ||
      input.expandedKinds.has(kind) ||
      input.activeKind === kind;
    const shouldAutoCollapse =
      !forceExpand && kindRows.length > DIRECTORY_ACCORDION_COLLAPSE_AT;
    const collapsed = shouldAutoCollapse;
    const showAll =
      searching || fullyExpanded.has(kind) || kindRows.length <= DIRECTORY_KIND_VISIBLE_CAP;
    const visible = collapsed
      ? []
      : showAll
        ? kindRows
        : kindRows.slice(0, DIRECTORY_KIND_VISIBLE_CAP);
    const hiddenCount = Math.max(0, kindRows.length - visible.length);

    sections.push({
      id: `kind-${kind}`,
      label: `${DIRECTORY_KIND_LABEL[kind]} · ${kindRows.length.toLocaleString("fa-IR")}`,
      kind,
      rows: visible,
      collapsed,
      hiddenCount: collapsed ? kindRows.length : hiddenCount,
    });
  }

  return sections;
}

export function filterWorkspacesByDirectoryQuery(
  workspaces: WorkspaceSummary[],
  query: string,
): WorkspaceSummary[] {
  const q = query.trim();
  if (!q) return workspaces;
  return workspaces.filter((ws) => matchesQuery(toRow(ws), q));
}
