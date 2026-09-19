import { describe, expect, it } from "vitest";
import { fuzzyScore } from "@/components/shell/command-palette";

describe("fuzzyScore", () => {
  it("returns 0 for empty query", () => {
    expect(fuzzyScore("", "هر چیزی")).toBe(0);
    expect(fuzzyScore("   ", "jobs")).toBe(0);
  });

  it("scores exact match highest", () => {
    expect(fuzzyScore("jobs", "jobs")).toBe(10_000);
    expect(fuzzyScore("JOBS", "jobs")).toBe(10_000);
  });

  it("prefers contiguous substring over subsequence", () => {
    const contiguous = fuzzyScore("job", "jobs queue");
    const sparse = fuzzyScore("jq", "jobs queue");
    expect(contiguous).toBeGreaterThan(sparse);
    expect(contiguous).toBeGreaterThan(0);
  });

  it("returns -1 when query chars are missing", () => {
    expect(fuzzyScore("xyz", "jobs")).toBe(-1);
    expect(fuzzyScore("صف کار", "اعلان")).toBe(-1);
  });

  it("matches Persian labels as subsequence", () => {
    expect(fuzzyScore("صف", "صف کارها")).toBeGreaterThan(0);
    expect(fuzzyScore("کار", "صف کارها")).toBeGreaterThan(0);
  });
});
