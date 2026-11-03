/**
 * Hard-coded design census for apps/web and packages/ui.
 *
 * Same four buckets as the phase-1 baseline (commit 098406d, 5856 findings):
 * color, spacing, font, shadow. packages/ui/src/tokens.css is the token
 * source: its colors are reported separately and are not part of the total.
 * A custom-property definition and a var(--dang-*) fallback are token source
 * too, so they are not counted again as paint.
 *
 * Spacing is a px/rem length on a layout property. Font is a line-start
 * font-size, font-weight, or font-family declaration. Shadow is a box-shadow
 * or drop-shadow whose value still has a literal color. Color is a hex, an
 * rgb/hsl/oklch function, or a hue word the baseline treated as a color.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const CENSUS_BASELINE = {
  color: 609,
  spacing: 3703,
  font: 1468,
  shadow: 76,
  total: 5856,
};

/** What this script reads on the phase-1 tree (098406d). The audit pass was 5856. */
export const SCRIPT_PHASE1_TOTAL = 5892;

const SKIP_DIR = new Set([
  "node_modules",
  "coverage",
  "dist",
  ".next",
  ".next-prod",
  "storybook-static",
]);

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;
const COLOR_FUNC = /\b(?:rgba?|hsla?|oklch|oklab)\([^)]*\)/gi;
const HUE =
  /(?<![\w-])(?:gold|teal|coral|blue|violet|indigo|white|black|olive|cyan|lime|navy|fuchsia|green)(?![\w-])/g;
const LENGTH = /\d*\.?\d+(?:px|rem)\b/g;
const FONT =
  /(?:^|\n)[ \t]*font-(?:size|weight|family)\s*:[^;\n]*|font(?:Size|Weight|Family)\s*:[^,\n}]*/g;
const PROP = /(?:^|[^\w-])(-?-?[\w-]+)\s*:/g;

const LAYOUT_NAMES = new Set([
  "padding",
  "padding-top",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "margin",
  "margin-top",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "gap",
  "column-gap",
  "row-gap",
  "width",
  "height",
  "min-width",
  "max-width",
  "min-height",
  "max-height",
  "top",
  "right",
  "bottom",
  "left",
  "inset",
  "border-top",
  "border-bottom",
  "border-left",
  "border-right",
  "scroll-margin-top",
  "line-height",
  "rootMargin",
  "paddingInlineStart",
  "marginBottom",
  "marginTop",
  "marginBlock",
  "paddingBlock",
  "borderBottom",
  "gridTemplateRows",
]);

function isLayout(name) {
  if (LAYOUT_NAMES.has(name)) return true;
  return name.startsWith("--") && /(?:gap|space)$/.test(name);
}

function isHardFont(value) {
  return /px|rem|em|\d|monospace|Consolas|Menlo|serif|sans/i.test(value);
}

/** Fallback hex inside var(--dang-*) is the token, not a second hardcoded color. */
function stripComments(text, file) {
  const block = text.replace(/\/\*[\s\S]*?\*\//g, (chunk) => chunk.replace(/[^\n]/g, " "));
  if (!file.endsWith(".css")) {
    return block.replace(/(^|[^:"'])\/\/[^\n]*/g, "$1");
  }
  return block;
}

function withoutDangFallbacks(text) {
  let prev = "";
  let next = text;
  const nested = /var\(--dang-[\w-]+(?:\s*,[^)]*)?\)/g;
  while (next !== prev) {
    prev = next;
    next = next.replace(nested, "var(--dang-token)");
  }
  return next;
}

function walk(dir, files) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
      continue;
    }
    if (/\.(?:css|tsx|ts)$/.test(entry.name)) files.push(full);
  }
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function pushMatches(findings, text, file, regex, type) {
  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(text))) {
    findings.push({
      file,
      line: lineOf(text, match.index),
      type,
      value: match[0].trim(),
    });
  }
}

function declarationValue(line, property) {
  const at = line.lastIndexOf(property);
  if (at < 0) return null;
  let value = line.slice(at + property.length).replace(/^\s*:\s*/, "");
  const semi = value.indexOf(";");
  if (semi >= 0) value = value.slice(0, semi);
  return value.trim();
}

function isLiteralShadow(value) {
  if (!value) return false;
  if (value === "none" || value.startsWith("none")) return true;
  return /#|rgba?\(|hsla?\(|oklch\(|color-mix\(/i.test(value);
}

function scanFile(text, file, keepCustomProps = false) {
  const findings = [];
  const stripped = stripComments(withoutDangFallbacks(text), file);
  const colorText = keepCustomProps
    ? stripped
    : stripped
        .split("\n")
        .map((line) => (/^\s*--[\w-]+\s*:/.test(line) ? "" : line))
        .join("\n");
  pushMatches(findings, colorText, file, HEX, "color");
  pushMatches(findings, colorText, file, COLOR_FUNC, "color");
  pushMatches(findings, colorText, file, HUE, "color");
  FONT.lastIndex = 0;
  let font;
  while ((font = FONT.exec(text))) {
    const value = font[0].replace(/^\s+/, "").replace(/\s*:\s*/, ": ").replace(/\s+/g, " ").trim();
    if (!isHardFont(value)) continue;
    findings.push({
      file,
      line: lineOf(text, font.index),
      type: "font",
      value,
    });
  }

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.includes("box-shadow:")) {
      const value = declarationValue(line, "box-shadow");
      if (isLiteralShadow(value)) {
        findings.push({ file, line: i + 1, type: "shadow", value });
      }
    }
    if (line.includes("drop-shadow")) {
      const value = declarationValue(line, "drop-shadow") ?? line.slice(line.indexOf("drop-shadow")).trim();
      if (isLiteralShadow(value) || value.startsWith("drop-shadow")) {
        findings.push({ file, line: i + 1, type: "shadow", value });
      }
    }
    PROP.lastIndex = 0;
    let prop;
    while ((prop = PROP.exec(line))) {
      const name = prop[1];
      if (!isLayout(name)) continue;
      const start = prop.index + prop[0].length;
      const end = line.indexOf(";", start);
      const chunk = line.slice(start, end === -1 ? line.length : end);
      LENGTH.lastIndex = 0;
      let length;
      while ((length = LENGTH.exec(chunk))) {
        findings.push({
          file,
          line: i + 1,
          type: "spacing",
          value: length[0],
        });
      }
    }
  }
  return findings;
}

export function scanTokenCensus(root) {
  const files = [];
  for (const rel of ["apps/web", "packages/ui"]) {
    walk(join(root, rel), files);
  }
  const findings = [];
  let tokenSourceColors = 0;
  for (const file of files) {
    const rel = relative(root, file).replaceAll("\\", "/");
    const text = readFileSync(file, "utf8");
    if (rel === "packages/ui/src/tokens.css") {
      tokenSourceColors += scanFile(text, rel, true).filter((item) => item.type === "color").length;
      continue;
    }
    findings.push(...scanFile(text, rel));
  }
  const counts = { color: 0, spacing: 0, font: 0, shadow: 0 };
  for (const item of findings) counts[item.type] += 1;
  const total = counts.color + counts.spacing + counts.font + counts.shadow;
  return {
    counts,
    total,
    tokenSourceColors,
    delta: total - CENSUS_BASELINE.total,
    findings,
  };
}

function report(result) {
  const rows = [
    ["color", result.counts.color, CENSUS_BASELINE.color],
    ["spacing", result.counts.spacing, CENSUS_BASELINE.spacing],
    ["font", result.counts.font, CENSUS_BASELINE.font],
    ["shadow", result.counts.shadow, CENSUS_BASELINE.shadow],
    ["total", result.total, CENSUS_BASELINE.total],
  ];
  for (const [name, now, base] of rows) {
    const delta = now - base;
    const sign = delta > 0 ? "+" : "";
    console.log(`${name}\t${now}\tbaseline ${base}\t${sign}${delta}`);
  }
  const cssHex = result.findings.filter(
    (item) => item.type === "color" && item.value.startsWith("#") && item.file.endsWith(".css"),
  ).length;
  console.log(`token-source colors in tokens.css (excluded)\t${result.tokenSourceColors}`);
  console.log(`css rule hex\t${cssHex}`);
  console.log(
    `same script on 098406d\t${SCRIPT_PHASE1_TOTAL}\taudit offset ${SCRIPT_PHASE1_TOTAL - CENSUS_BASELINE.total}`,
  );
}

const isDirectRun = process.argv[1]?.endsWith("token-census.mjs");
if (isDirectRun) {
  report(scanTokenCensus(ROOT));
}
