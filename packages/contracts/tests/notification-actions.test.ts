import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  notificationActionsForEvent,
  enrichNotificationMetadata,
} from "@dang/contracts";

describe("notification actions (G11 #43)", () => {
  it("maps debt remind to settle+open", () => {
    assert.deepEqual(notificationActionsForEvent("group.debt.remind"), [
      "settle",
      "open",
    ]);
  });

  it("enriches metadata.actions when missing", () => {
    const next = enrichNotificationMetadata({
      event: "approval.pending",
      route: "/approvals",
    });
    assert.equal(next?.actions, "approve,open");
  });

  it("does not overwrite explicit actions", () => {
    const next = enrichNotificationMetadata({
      event: "group.debt.remind",
      actions: "open",
    });
    assert.equal(next?.actions, "open");
  });
});
