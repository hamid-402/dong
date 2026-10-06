import {
  spaceKindForTemplate,
  type SpaceKind,
  type WorkspaceTemplate,
} from "@dang/contracts";
import type { ContextualMosaicItem } from "@/lib/navigation-v2";

/** Representative template per kind — for docs / future kind tooling. */
export const KIND_SAMPLE_TEMPLATE: Record<SpaceKind, WorkspaceTemplate> = {
  personal: "personal",
  group: "friends_family",
  building: "residential_building",
  org: "small_team",
};

export type KindWorkspacePick = {
  id: string;
  slug: string;
  name: string;
  template: WorkspaceTemplate;
};

/**
 * Prefer the active workspace when it matches the kind; otherwise the first of that kind.
 */
export function pickKindTarget(
  workspaces: readonly KindWorkspacePick[],
  kind: SpaceKind,
  activeWorkspaceId?: string | null,
): KindWorkspacePick | null {
  const matched = workspaces.filter(
    (ws) => spaceKindForTemplate(ws.template) === kind,
  );
  if (matched.length === 0) return null;
  if (activeWorkspaceId) {
    const active = matched.find((ws) => ws.id === activeWorkspaceId);
    if (active) return active;
  }
  return matched[0] ?? null;
}

/** Kind tiles for account home / spaces «all» — open the kind hub, not a single-space op. */
export function kindDomainMosaicItems(
  counts: Record<SpaceKind, number>,
  offered: (kind: SpaceKind) => boolean = () => true,
): ContextualMosaicItem[] {
  const meta: Array<{
    key: SpaceKind;
    label: string;
    summary: string;
    gemKey: string;
    icon: ContextualMosaicItem["icon"];
  }> = [
    {
      key: "personal",
      label: "شخصی",
      summary: "دفتر و بودجهٔ شخصی",
      gemKey: "indigo",
      icon: "wallet",
    },
    {
      key: "group",
      label: "گروهی",
      summary: "دوستان، خانواده و سفر",
      gemKey: "teal",
      icon: "partners",
    },
    {
      key: "building",
      label: "ساختمان",
      summary: "واحدها، شارژ و قبوض",
      gemKey: "amber",
      icon: "home",
    },
    {
      key: "org",
      label: "سازمان",
      summary: "تیم، بخش و تدارکات",
      gemKey: "violet",
      icon: "partners",
    },
  ];

  return meta.filter((row) => offered(row.key)).map((row) => {
    const count = counts[row.key] ?? 0;
    return {
      key: `kind-${row.key}`,
      label: row.label,
      href: count > 0 ? `/home?kind=${row.key}` : `/spaces/new?kind=${row.key}`,
      icon: row.icon,
      summary:
        count > 0
          ? `${count.toLocaleString("fa-IR")} فضا · گزارش تجمیعی و فهرست`
          : `خالی · ${row.summary}`,
      intent: "manage" as const,
      gemKey: row.gemKey,
    };
  });
}
