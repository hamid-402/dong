import assert from "node:assert/strict";
import test from "node:test";
import { resolvePenTestEngagementStatus } from "../src/pen-test-status.js";

test("resolvePenTestEngagementStatus defaults to prep_ready", () => {
  assert.equal(resolvePenTestEngagementStatus({}), "prep_ready");
  assert.equal(resolvePenTestEngagementStatus({ PENTEST_STATUS: "" }), "prep_ready");
});

test("resolvePenTestEngagementStatus maps env aliases", () => {
  assert.equal(
    resolvePenTestEngagementStatus({ PENTEST_STATUS: "engaged" }),
    "engaged",
  );
  assert.equal(
    resolvePenTestEngagementStatus({ PENTEST_STATUS: "in_progress" }),
    "engaged",
  );
  assert.equal(
    resolvePenTestEngagementStatus({ PENTEST_STATUS: "remediating" }),
    "remediating",
  );
  assert.equal(
    resolvePenTestEngagementStatus({ PENTEST_STATUS: "closed" }),
    "closed",
  );
});
