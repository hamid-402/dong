import assert from "node:assert/strict";
import test from "node:test";
import {
  computeAuditEventHash,
  verifyAuditEventHash,
} from "../src/audit-hash.js";

test("audit hash genesis and chain link", () => {
  const base = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    workspaceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    actorUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    action: "x",
    targetType: "y",
    targetId: null as string | null,
    result: "success",
    occurredAtIso: "2026-09-12T00:00:00.000Z",
  };
  const h0 = computeAuditEventHash({ ...base, prevHash: null });
  const h1 = computeAuditEventHash({
    ...base,
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    action: "z",
    prevHash: h0,
  });
  assert.notEqual(h0, h1);
  assert.equal(verifyAuditEventHash({ ...base, prevHash: null }, h0), true);
  assert.equal(
    verifyAuditEventHash(
      {
        ...base,
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        action: "z",
        prevHash: h0,
      },
      h1,
    ),
    true,
  );
});
