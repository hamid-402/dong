/**
 * Interactive controls must declare at least 44px (var(--dang-touch)).
 * Decorative marks, screen-reader clips, and the visual box inside a 44px
 * parent are listed in ALLOW. A new undersized hit target fails this gate.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Not the hit target: clip, indicator, glyph, or the box inside a 44px control. */
const ALLOW = [
  "dang-sr",
  "receiptUpload__label input",
  "expenseStepper",
  "shell-navMenu__item.is-active",
  "spaces-hub__chip span",
  "dang-choice__input",
  "chipMood",
  "hubHero__meta",
  "visually-hidden",
];

const INTERACTIVE =
  /(button|\ba\b|\binput\b|select|textarea|summary|\[role=.?(?:button|tab|link|menuitem)|Btn|__tab\b|__trigger|__close|__chip)/i;

const SKIP_DECOR =
  /icon|svg|::|mark\b|sep\b|badge-count|__thumb|__track|sr-only|visually-hidden/i;

const SIZE = /(?:min-height|min-width|height|width)\s*:\s*([0-9.]+)(px|rem)/g;

export function scanTouchTargets(root) {
  const files = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "coverage") continue;
        walk(full);
      } else if (entry.name.endsWith(".css")) files.push(full);
    }
  }
  for (const rel of ["apps/web/src", "packages/ui/src"]) {
    walk(join(root, rel));
  }

  const violations = [];
  for (const file of files) {
    if (file.endsWith(`${join("packages", "ui", "src", "tokens.css")}`)) continue;
    const text = readFileSync(file, "utf8");
    const rel = relative(root, file).replaceAll("\\", "/");
    let offset = 0;
    for (const block of text.split("}")) {
      const brace = block.indexOf("{");
      if (brace < 0) {
        offset += block.length + 1;
        continue;
      }
      const selector = block.slice(0, brace).replace(/\s+/g, " ").trim();
      const body = block.slice(brace + 1);
      const line = text.slice(0, offset).split(/\n/).length;
      offset += block.length + 1;
      if (!INTERACTIVE.test(selector) || SKIP_DECOR.test(selector)) continue;
      if (ALLOW.some((part) => selector.includes(part))) continue;
      SIZE.lastIndex = 0;
      let match;
      while ((match = SIZE.exec(body))) {
        const px = match[2] === "rem" ? Number(match[1]) * 16 : Number(match[1]);
        if (px > 0 && px < 44) {
          violations.push({
            file: rel,
            line,
            px: Math.round(px * 10) / 10,
            decl: match[0].replace(/\s+/g, ""),
            selector: selector.slice(0, 160),
          });
        }
      }
    }
  }
  return violations;
}

const isDirectRun = process.argv[1]?.endsWith("touch-target-gate.mjs");
if (isDirectRun) {
  const violations = scanTouchTargets(ROOT);
  if (violations.length === 0) {
    console.log("touch-target: OK — interactive CSS is at least 44px");
  } else {
    console.error(`touch-target: FAIL — ${violations.length} declared hit target(s) under 44px`);
    for (const item of violations) {
      console.error(`${item.file}:${item.line} ${item.decl} (${item.px}px) ${item.selector}`);
    }
    process.exit(1);
  }
}
