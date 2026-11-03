import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { scanTouchTargets } from "./touch-target-gate.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function fixture(css) {
  const root = mkdtempSync(join(tmpdir(), "touch-gate-"));
  const dir = join(root, "apps", "web", "src");
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(root, "packages", "ui", "src"), { recursive: true });
  writeFileSync(join(dir, "widget.css"), css, "utf8");
  return root;
}

test("a 32px button is a violation", () => {
  const root = fixture(".go button {\n  min-height: 32px;\n}\n");
  try {
    const found = scanTouchTargets(root);
    assert.equal(found.length, 1);
    assert.equal(found[0].px, 32);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("var(--dang-touch) is accepted", () => {
  const root = fixture(".go button {\n  min-height: var(--dang-touch);\n  min-width: var(--dang-touch);\n}\n");
  try {
    assert.equal(scanTouchTargets(root).length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the product tree has no undersized interactive target", () => {
  const found = scanTouchTargets(repoRoot);
  assert.deepEqual(
    found,
    [],
    found.map((item) => `${item.file}:${item.line} ${item.decl}`).join("\n"),
  );
});
