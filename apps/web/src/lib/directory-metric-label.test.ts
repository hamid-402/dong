/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { formatDirectoryNetHint } from "./directory-metric-label";

describe("formatDirectoryNetHint", () => {
  it("omits when metrics absent", () => {
    expect(formatDirectoryNetHint(undefined, undefined, "rial")).toBeNull();
  });

  it("formats credit and open settlements", () => {
    const label = formatDirectoryNetHint("1000", 2, "rial");
    expect(label).toContain("طلب");
    expect(label).toContain("تسویه باز");
  });

  it("formats settled zero without inventing open count", () => {
    expect(formatDirectoryNetHint("0", 0, "rial")).toBe("تسویه");
    expect(formatDirectoryNetHint("0", undefined, "rial")).toBe("تسویه");
  });
});
