/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { mergePinnedWorkspaceIds } from "@dang/contracts";

describe("mergePinnedWorkspaceIds", () => {
  it("unions local-first without dropping server-only ids", () => {
    expect(
      mergePinnedWorkspaceIds(["a", "b"], ["b", "c", "d"]),
    ).toEqual(["a", "b", "c", "d"]);
  });

  it("respects cap", () => {
    const local = Array.from({ length: 6 }, (_, i) => `l${i}`);
    const server = Array.from({ length: 6 }, (_, i) => `s${i}`);
    expect(mergePinnedWorkspaceIds(local, server, 8)).toHaveLength(8);
  });
});
