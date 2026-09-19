import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  HIGH_TRAFFIC_PAGE_SOURCES,
  MAX_BREADCRUMB_DEPTH,
  PAGE_PATTERN_CHECKLIST,
} from "@/lib/page-pattern";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("S11-12 page pattern", () => {
  it("keeps checklist and max breadcrumb depth aligned with IA-UX", () => {
    expect(MAX_BREADCRUMB_DEPTH).toBe(3);
    expect(PAGE_PATTERN_CHECKLIST.length).toBeGreaterThanOrEqual(5);
  });

  it("requires WorkspacePageFrame on every high-traffic source", () => {
    const missing: string[] = [];
    for (const rel of HIGH_TRAFFIC_PAGE_SOURCES) {
      const full = join(srcRoot, rel);
      const source = readFileSync(full, "utf8");
      if (!source.includes("WorkspacePageFrame")) {
        missing.push(rel);
      }
    }
    expect(missing, `missing WorkspacePageFrame:\n${missing.join("\n")}`).toEqual([]);
  });
});
