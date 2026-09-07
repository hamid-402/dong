#!/usr/bin/env node
/**
 * #64 soft i18n gate: fa.json and en.json must share the same key set.
 * Does not require UI to use t() yet (see docs/I18N.md).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "web", "src", "messages");
const fa = JSON.parse(readFileSync(join(root, "fa.json"), "utf8"));
const en = JSON.parse(readFileSync(join(root, "en.json"), "utf8"));

const faKeys = Object.keys(fa).sort();
const enKeys = Object.keys(en).sort();

const missingInEn = faKeys.filter((k) => !Object.hasOwn(en, k));
const missingInFa = enKeys.filter((k) => !Object.hasOwn(fa, k));

if (missingInEn.length || missingInFa.length) {
  console.error("i18n scaffold key mismatch:");
  if (missingInEn.length) console.error("  missing in en.json:", missingInEn.join(", "));
  if (missingInFa.length) console.error("  missing in fa.json:", missingInFa.join(", "));
  process.exit(1);
}

if (faKeys.length === 0) {
  console.error("fa.json is empty");
  process.exit(1);
}

console.log(`i18n scaffold OK (${faKeys.length} keys)`);
