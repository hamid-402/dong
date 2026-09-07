import assert from "node:assert/strict";
import test from "node:test";
import type { DeadLetterJob } from "@dang/contracts";
import { dlqEntryMatchesWorkspace } from "./redis-queue.js";

function entry(workspaceId?: string): DeadLetterJob {
  return {
    job: {
      jobId: "j1",
      name: "notify.email",
      workspaceId: workspaceId as string,
      enqueuedAt: "2026-01-01T00:00:00.000Z",
    },
    error: "boom",
    attempts: 3,
    failedAt: "2026-01-01T00:01:00.000Z",
  };
}

test("dlqEntryMatchesWorkspace prefers exact workspaceId match", () => {
  assert.equal(dlqEntryMatchesWorkspace(entry("ws-a"), "ws-a"), true);
  assert.equal(dlqEntryMatchesWorkspace(entry("ws-b"), "ws-a"), false);
});

test("dlqEntryMatchesWorkspace allows missing workspaceId for owner/admin callers", () => {
  const missing = entry("ws-a");
  // Simulate legacy / malformed payload without workspaceId
  (missing.job as { workspaceId?: string }).workspaceId = undefined;
  assert.equal(dlqEntryMatchesWorkspace(missing, "ws-a"), true);

  const empty = entry("ws-a");
  empty.job.workspaceId = "";
  assert.equal(dlqEntryMatchesWorkspace(empty, "ws-a"), true);
});
