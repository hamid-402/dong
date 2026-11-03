import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CENSUS_BASELINE, scanTokenCensus } from "./token-census.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "token-census-"));
  const web = join(root, "apps", "web", "src");
  const ui = join(root, "packages", "ui", "src");
  mkdirSync(web, { recursive: true });
  mkdirSync(ui, { recursive: true });
  writeFileSync(
    join(web, "widget.css"),
    [
      ".card {",
      "  padding: 8px 12px;",
      "  color: #fff;",
      "  font-size: 1rem;",
      "  box-shadow: 0 1px 2px color-mix(in srgb, var(--dang-text) 20%, transparent);",
      "  white-space: nowrap;",
      "  background: var(--dang-bg, #111);",
      "}",
      "--local: #abc;",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(join(ui, "tokens.css"), "--dang-bg: #f7f4ee;\n", "utf8");
  return root;
}

test("a painted hex is counted and token definitions are not", () => {
  const root = fixture();
  try {
    const result = scanTokenCensus(root);
    assert.equal(result.counts.color, 1);
    assert.equal(result.counts.spacing, 2);
    assert.equal(result.counts.font, 1);
    assert.equal(result.counts.shadow, 1);
    assert.equal(result.tokenSourceColors, 1);
    assert.equal(result.total, 5);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("product css rules have no raw hex and the total stays under 5856", () => {
  const result = scanTokenCensus(repoRoot);
  const cssHex = result.findings.filter(
    (item) => item.type === "color" && item.value.startsWith("#") && item.file.endsWith(".css"),
  );
  assert.equal(cssHex.length, 0);
  assert.ok(result.tokenSourceColors > 0);
  assert.ok(result.total < CENSUS_BASELINE.total);
});
