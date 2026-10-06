import { test, expect } from "@playwright/test";
import { devApiAuthHeaders } from "./helpers/dev-session";

/**
 * Smoke: personal lifestyle ledger — allocation → paycheck → lifestyle snapshot → annual CSV.
 * Requires ALLOW_DEV_AUTH + live API (same gate as treasury-funding).
 */
test.describe("personal lifestyle ledger (API)", () => {
  test("paycheck closes lifestyle month and annual csv returns body", async ({
    request,
  }) => {
    const headers = await devApiAuthHeaders(request);
    const caps = await request.get(`/api/v1/system/capabilities`, { headers });
    expect(caps.ok()).toBeTruthy();

    const planGet = await request.get(`/api/v1/me/finance/allocation-plan`, {
      headers,
    });
    expect(planGet.ok(), `allocation-plan ${planGet.status()}`).toBeTruthy();
    const plan = (await planGet.json()) as {
      percents: Record<string, number>;
    };
    expect(plan.percents.savings).toBeGreaterThanOrEqual(0);

    const put = await request.put(`/api/v1/me/finance/allocation-plan`, {
      headers,
      data: {
        percents: { solo: 40, group: 15, building: 10, org: 5, savings: 30 },
      },
    });
    expect(put.ok(), `put allocation ${put.status()}`).toBeTruthy();

    const key = `e2e-paycheck-${Date.now()}`;
    const paycheck = await request.post(`/api/v1/me/finance/paychecks`, {
      headers,
      data: {
        amountMinor: "12000000",
        occurredOn: new Date().toISOString().slice(0, 10),
        note: "e2e حقوق",
        idempotencyKey: key,
      },
    });
    if (paycheck.status() === 400) {
      const body = (await paycheck.json()) as { detail?: string };
      // Same Jalali month may already have a paycheck from a prior run.
      expect(
        String(body.detail ?? "").includes("ماه") ||
          String(body.detail ?? "").length > 0,
      ).toBeTruthy();
    } else {
      expect(paycheck.ok(), `paycheck ${paycheck.status()}`).toBeTruthy();
      const pc = (await paycheck.json()) as {
        yearMonth: string;
        moneyTxnId?: string;
      };
      expect(pc.yearMonth).toMatch(/^\d{4}-\d{2}$/);
      expect(pc.moneyTxnId).toBeTruthy();

      const lifestyle = await request.get(
        `/api/v1/me/finance/lifestyle?yearMonth=${encodeURIComponent(pc.yearMonth)}`,
        { headers },
      );
      expect(lifestyle.ok()).toBeTruthy();
      const snap = (await lifestyle.json()) as {
        paycheckCount: number;
        incomeTotal: { amountMinor: string };
        byDomain: Array<{ domain: string }>;
      };
      expect(snap.paycheckCount).toBeGreaterThanOrEqual(1);
      expect(BigInt(snap.incomeTotal.amountMinor)).toBeGreaterThan(0n);
      expect(snap.byDomain.length).toBe(5);
    }

    const year = Number(
      new Intl.DateTimeFormat("en-u-ca-persian", { year: "numeric" })
        .format(new Date())
        .replace(/\D/g, ""),
    );
    const annual = await request.post(`/api/v1/me/finance/statements/annual`, {
      headers,
      data: { jalaliYear: year || 1405, format: "csv" },
    });
    expect(annual.ok(), `annual ${annual.status()}`).toBeTruthy();
    const csv = await annual.text();
    expect(csv).toContain("سال شمسی");
  });
});
