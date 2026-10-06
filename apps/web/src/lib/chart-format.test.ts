import { describe, expect, it } from "vitest";
import {
  chartSourceLabel,
  formatChartToman,
  mergeSumSeries,
  netsToShareSeries,
} from "@/lib/chart-format";
import type { ChartSeriesResponse } from "@dang/contracts";

describe("chart-format", () => {
  it("chartSourceLabel uses Persian names and keeps unknown ids", () => {
    expect(chartSourceLabel("expenses_posted")).toBe("خرج‌های ثبت‌شده");
    expect(chartSourceLabel("expense_splits")).toBe("سهم اعضا");
    expect(chartSourceLabel("merged:a+b")).toBe("چند فضا");
    expect(chartSourceLabel("custom_feed")).toBe("custom_feed");
  });

  it("formatChartToman converts IRR minor", () => {
    expect(formatChartToman("10000")).toMatch(/۱٬?۰۰۰|1,?000/);
  });

  it("mergeSumSeries sums months across spaces", () => {
    const a: ChartSeriesResponse = {
      chart: "expense-trend",
      currency: "IRR",
      source: "a",
      points: [
        { key: "2026-01", label: "2026-01", valueMinor: "1000" },
        { key: "2026-02", label: "2026-02", valueMinor: "2000" },
      ],
    };
    const b: ChartSeriesResponse = {
      chart: "expense-trend",
      currency: "IRR",
      source: "b",
      points: [{ key: "2026-01", label: "2026-01", valueMinor: "500" }],
    };
    const merged = mergeSumSeries([
      { label: "A", series: a },
      { label: "B", series: b },
    ]);
    expect(merged.points.find((p) => p.key === "2026-01")?.valueMinor).toBe("1500");
    expect(merged.points.find((p) => p.key === "2026-02")?.valueMinor).toBe("2000");
  });

  it("netsToShareSeries skips zero nets", () => {
    const series = netsToShareSeries([
      { workspaceId: "1", name: "G1", net: { toman: 100 } },
      { workspaceId: "2", name: "G2", net: { toman: 0 } },
      { workspaceId: "3", name: "G3", net: { toman: -50 } },
    ]);
    expect(series.points).toHaveLength(2);
    expect(series.points[0]?.key).toBe("1");
  });
});
