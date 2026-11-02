/**
 * Precheck for db:migrate: if 0098_pending_psp_rls is in the journal,
 * 0099_pending_psp_migrator_policies must also be present and ordered after it.
 * No database. No .env. No secrets.
 *
 * Optional argv[2]: path to a journal JSON (for local fail-path checks only).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TAG_0098 = "0098_pending_psp_rls";
const TAG_0099 = "0099_pending_psp_migrator_policies";

const __dirname = dirname(fileURLToPath(import.meta.url));
const journalPath =
  process.argv[2] ?? resolve(__dirname, "../migrations/meta/_journal.json");

const journal = JSON.parse(readFileSync(journalPath, "utf8"));
const entries = Array.isArray(journal?.entries) ? journal.entries : [];

const entry0098 = entries.find((e) => e?.tag === TAG_0098);
const entry0099 = entries.find((e) => e?.tag === TAG_0099);

if (!entry0098) {
  process.exit(0);
}

if (!entry0099) {
  console.error(
    `assert-0098-0099-pair: journal has "${TAG_0098}" but missing "${TAG_0099}". ` +
      `Add migration 0099 before migrating.`,
  );
  process.exit(1);
}

const index0098 = entries.findIndex((e) => e?.tag === TAG_0098);
const index0099 = entries.findIndex((e) => e?.tag === TAG_0099);
const idx0098 = typeof entry0098.idx === "number" ? entry0098.idx : index0098;
const idx0099 = typeof entry0099.idx === "number" ? entry0099.idx : index0099;

if (!(idx0099 > idx0098) || !(index0099 > index0098)) {
  console.error(
    `assert-0098-0099-pair: "${TAG_0099}" must appear after "${TAG_0098}" in the journal ` +
      `(idx ${idx0098} → ${idx0099}, entry order ${index0098} → ${index0099}).`,
  );
  process.exit(1);
}

process.exit(0);
