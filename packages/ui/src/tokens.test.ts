import { test } from "node:test";
import assert from "node:assert/strict";
import { darkTokens, lightTokens, type DesignTokens } from "./tokens.js";

const KEY_TO_CSS: Record<keyof DesignTokens, string> = {
  bg: "var(--dang-bg)",
  surface: "var(--dang-surface)",
  surface2: "var(--dang-surface-2)",
  surface3: "var(--dang-surface-3)",
  text: "var(--dang-text)",
  muted: "var(--dang-muted)",
  primary: "var(--dang-primary)",
  primaryDeep: "var(--dang-primary-deep)",
  primaryInk: "var(--dang-primary-ink)",
  gold: "var(--dang-gold)",
  success: "var(--dang-success)",
  warning: "var(--dang-warning)",
  danger: "var(--dang-danger)",
};

test("lightTokens aliases every key to var(--dang-*)", () => {
  for (const [key, cssVar] of Object.entries(KEY_TO_CSS) as [keyof DesignTokens, string][]) {
    assert.equal(lightTokens[key], cssVar, key);
  }
});

test("darkTokens aliases every key to var(--dang-*)", () => {
  for (const [key, cssVar] of Object.entries(KEY_TO_CSS) as [keyof DesignTokens, string][]) {
    assert.equal(darkTokens[key], cssVar, key);
  }
});

test("lightTokens and darkTokens share the same CSS var aliases", () => {
  assert.deepEqual({ ...lightTokens }, { ...darkTokens });
});

test("no raw hex remains in lightTokens or darkTokens", () => {
  const hex = /#[0-9a-fA-F]{3,8}\b/;
  for (const value of Object.values(lightTokens)) {
    assert.equal(hex.test(value), false, value);
  }
  for (const value of Object.values(darkTokens)) {
    assert.equal(hex.test(value), false, value);
  }
});
