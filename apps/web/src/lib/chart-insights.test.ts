import { describe, expect, it } from "vitest";
import type { ChartSeriesResponse } from "@dang/contracts";
import {
  buildDualInsights,
  buildShareInsights,
  buildTrendInsights,
  formatChartMonthLabel,
  parseReportMonths,
  rangeFromMonths,
  kindBalanceRowsToCsv,
  rankSpacesBySpend,
  seriesToCsv,
  spendConcentration,
  spendRanksToSeries,
  withFriendlyChartLabels,
} from "@/lib/chart-insights";

const trend: ChartSeriesResponse = {
  chart: "expense-trend",
  currency: "IRR",
  source: "test",
  months: 3,
  points: [
    { key: "2026-01", label: "2026-01", valueMinor: "10000" },
    { key: "2026-02", label: "2026-02", valueMinor: "20000" },
  ],
};

describe("chart-insights", () => {
  it("formats month labels in Jalali Persian", () => {
    expect(formatChartMonthLabel("2026-02")).toBe("بهمن ۱۴۰۴");
    expect(formatChartMonthLabel("2026-01")).toBe("دی ۱۴۰۴");
  });

  it("withFriendlyChartLabels rewrites YYYY-MM keys to Jalali", () => {
    const labeled = withFriendlyChartLabels(trend);
    expect(labeled.points[0]?.label).toBe("دی ۱۴۰۴");
    expect(labeled.points[1]?.label).toBe("بهمن ۱۴۰۴");
  });

  it("buildTrendInsights reports mom change", () => {
    const items = buildTrendInsights(trend);
    expect(items.some((i) => i.key === "mom")).toBe(true);
    expect(items.some((i) => i.key === "peak")).toBe(true);
  });

  it("buildShareInsights finds top share", () => {
    const mix: ChartSeriesResponse = {
      chart: "category-mix",
      currency: "IRR",
      source: "test",
      points: [
        { key: "food", label: "خوراک", valueMinor: "7000" },
        { key: "taxi", label: "تاکسی", valueMinor: "3000" },
      ],
    };
    const items = buildShareInsights(mix, "دسته");
    expect(items.find((i) => i.key === "top")?.value).toBe("خوراک");
  });

  it("buildDualInsights nets income vs expense", () => {
    const dual: ChartSeriesResponse = {
      chart: "income-vs-expense",
      currency: "IRR",
      source: "test",
      points: [
        {
          key: "2026-01",
          label: "2026-01",
          valueMinor: "50000",
          secondaryMinor: "20000",
        },
      ],
    };
    const items = buildDualInsights(dual);
    expect(items.find((i) => i.key === "net")?.value).toContain("مثبت");
  });

  it("seriesToCsv includes header and rows", () => {
    const csv = seriesToCsv(trend);
    expect(csv.split("\n")[0]).toContain("value_toman");
    expect(csv).toContain("2026-01");
  });

  it("rangeFromMonths returns inclusive window", () => {
    const { from, to } = rangeFromMonths(3, new Date("2026-06-15T12:00:00Z"));
    expect(from).toBe("2026-04-01");
    expect(to).toBe("2026-06-15");
  });

  it("rankSpacesBySpend orders by total spend", () => {
    const ranks = rankSpacesBySpend([
      {
        id: "a",
        slug: "a",
        name: "A",
        series: {
          chart: "expense-trend",
          currency: "IRR",
          source: "t",
          points: [{ key: "2026-01", label: "2026-01", valueMinor: "1000" }],
        },
      },
      {
        id: "b",
        slug: "b",
        name: "B",
        series: {
          chart: "expense-trend",
          currency: "IRR",
          source: "t",
          points: [
            { key: "2026-01", label: "2026-01", valueMinor: "2000" },
            { key: "2026-02", label: "2026-02", valueMinor: "3000" },
          ],
        },
      },
    ]);
    expect(ranks[0]?.id).toBe("b");
    expect(ranks[0]?.sharePct).toBeGreaterThan(50);
    expect(ranks[0]?.momPct).toBe(50);
    expect(spendRanksToSeries(ranks).points[0]?.key).toBe("b");
    expect(spendConcentration(ranks, 50)?.top.id).toBe("b");
  });

  it("parseReportMonths accepts 3/6/12 only", () => {
    expect(parseReportMonths("12")).toBe(12);
    expect(parseReportMonths("9")).toBe(6);
  });

  it("kindBalanceRowsToCsv works without charts (G16 / G07 #39)", () => {
    const csv = kindBalanceRowsToCsv([
      {
        name: 'خانه "الف"',
        slug: "home-a",
        net: { label: "بستانکار", toman: 12_500, tone: "credit" },
        openSettlements: 2,
      },
      {
        name: "ساده",
        slug: "simple",
        net: { label: "تسویه", toman: 0, tone: "zero" },
        openSettlements: 0,
      },
    ]);
    expect(csv.startsWith("name,slug,net_toman,net_tone,open_settlements\n")).toBe(
      true,
    );
    expect(csv).toContain('"خانه ""الف""",home-a,12500,credit,2');
    expect(csv).toContain("ساده,simple,0,zero,0");
  });
});
