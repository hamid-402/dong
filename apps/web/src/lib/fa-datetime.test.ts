/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { formatFaDate, formatFaDateLong, formatFaDateTime } from "@/lib/fa-datetime";

describe("fa-datetime", () => {
  it("formats ISO date-only as Jalali", () => {
    expect(formatFaDate("2026-09-05")).toBe("1405/06/14");
  });

  it("formats datetime without falling back to Gregorian calendar digits alone", () => {
    const label = formatFaDateTime("2026-09-05T12:00:00.000Z");
    expect(label).toMatch(/^1405\/06\/\d{2}/);
    expect(label).toContain("،");
  });

  it("builds a long Jalali label with weekday and month name", () => {
    const label = formatFaDateLong("2026-09-05T12:00:00");
    expect(label).toContain("شهریور");
    expect(label).toContain("1405");
  });
});
