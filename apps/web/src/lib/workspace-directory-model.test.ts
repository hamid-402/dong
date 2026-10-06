/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import type { WorkspaceSummary } from "@dang/contracts";
import { buildDirectorySections } from "./workspace-directory-model";

function ws(
  partial: Pick<WorkspaceSummary, "id" | "name" | "slug" | "template">,
): WorkspaceSummary {
  return {
    timezone: "Asia/Tehran",
    displayUnit: "rial",
    ...partial,
  };
}

describe("buildDirectorySections", () => {
  const manyGroups = Array.from({ length: 8 }, (_, i) =>
    ws({
      id: `g${i}`,
      name: `گروه ${i}`,
      slug: `g-${i}`,
      template: "friends_family",
    }),
  );

  const base = [
    ws({
      id: "p1",
      name: "شخصی من",
      slug: "me",
      template: "personal",
    }),
    ...manyGroups,
    ws({
      id: "b1",
      name: "برج",
      slug: "tower",
      template: "residential_building",
    }),
  ];

  it("surfaces pinned and recent before kind buckets", () => {
    const sections = buildDirectorySections({
      workspaces: base,
      query: "",
      pins: [{ workspaceId: "g2", pinnedAt: "2026-01-01T00:00:00.000Z" }],
      recent: [
        {
          workspaceId: "b1",
          visitedAt: "2026-01-02T00:00:00.000Z",
          visitCount: 2,
        },
      ],
      expandedKinds: new Set(),
    });
    expect(sections[0]?.id).toBe("pinned");
    expect(sections[0]?.rows.map((r) => r.id)).toEqual(["g2"]);
    expect(sections[1]?.id).toBe("recent");
    expect(sections[1]?.rows.map((r) => r.id)).toEqual(["b1"]);
  });

  it("auto-collapses large kind buckets until expanded", () => {
    const collapsed = buildDirectorySections({
      workspaces: base,
      query: "",
      pins: [],
      recent: [],
      expandedKinds: new Set(),
    });
    const group = collapsed.find((s) => s.id === "kind-group");
    expect(group?.collapsed).toBe(true);
    expect(group?.rows).toEqual([]);
    expect(group?.hiddenCount).toBe(8);

    const expanded = buildDirectorySections({
      workspaces: base,
      query: "",
      pins: [],
      recent: [],
      expandedKinds: new Set(["group"]),
    });
    const open = expanded.find((s) => s.id === "kind-group");
    expect(open?.collapsed).toBe(false);
    expect(open?.rows.length).toBe(8);
  });

  it("filters by fuzzy query and expands kinds while searching", () => {
    const sections = buildDirectorySections({
      workspaces: base,
      query: "برج",
      pins: [],
      recent: [],
      expandedKinds: new Set(),
    });
    expect(sections.every((s) => s.id.startsWith("kind-"))).toBe(true);
    const building = sections.find((s) => s.id === "kind-building");
    expect(building?.collapsed).toBe(false);
    expect(building?.rows.map((r) => r.id)).toEqual(["b1"]);
  });
});
