import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPoTransition,
  assertPrTransition,
  canTransitionNeedStatus,
  canTransitionPoStatus,
  canTransitionPrStatus,
} from "../src/procurement-transitions.js";

test("purchase request legal transitions", () => {
  assert.equal(canTransitionPrStatus("draft", "submitted"), true);
  assert.equal(canTransitionPrStatus("submitted", "approved"), true);
  assert.equal(canTransitionPrStatus("approved", "ordered"), true);
  assert.equal(canTransitionPrStatus("draft", "approved"), false);
  assert.doesNotThrow(() => assertPrTransition("draft", "submitted"));
  assert.throws(() => assertPrTransition("draft", "ordered"));
});

test("purchase order legal transitions", () => {
  assert.equal(canTransitionPoStatus("open", "partially_delivered"), true);
  assert.equal(canTransitionPoStatus("partially_delivered", "delivered"), true);
  assert.equal(canTransitionPoStatus("open", "cancelled"), true);
  assert.equal(canTransitionPoStatus("delivered", "cancelled"), false);
});

test("need legal transitions", () => {
  assert.equal(canTransitionNeedStatus("open", "fulfilled"), true);
  assert.equal(canTransitionNeedStatus("open", "cancelled"), true);
  assert.equal(canTransitionNeedStatus("fulfilled", "open"), false);
});
