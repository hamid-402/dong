import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergePinnedWorkspaceIds,
  UI_PINNED_WORKSPACE_CAP,
  updateUiPreferenceSchema,
} from "../src/wave-f.js";

describe("ui-prefs pinned workspaces", () => {
  it("mergePinnedWorkspaceIds keeps both sides under cap", () => {
    const merged = mergePinnedWorkspaceIds(
      ["a", "b"],
      ["c", "b"],
      UI_PINNED_WORKSPACE_CAP,
    );
    assert.deepEqual(merged, ["a", "b", "c"]);
  });

  it("updateUiPreferenceSchema accepts pinnedWorkspaceIds alone", () => {
    const parsed = updateUiPreferenceSchema.parse({
      pinnedWorkspaceIds: ["11111111-1111-4111-8111-111111111111"],
    });
    assert.equal(parsed.pinnedWorkspaceIds?.length, 1);
  });

  it("updateUiPreferenceSchema rejects over-cap pins", () => {
    const ids = Array.from(
      { length: 9 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    assert.throws(() =>
      updateUiPreferenceSchema.parse({ pinnedWorkspaceIds: ids }),
    );
  });
});
