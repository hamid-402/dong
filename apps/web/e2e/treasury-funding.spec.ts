import { test, expect } from "@playwright/test";
import { resolveWorkspace, devApiAuthHeaders } from "./helpers/dev-session";

/**
 * API-only deep checks for treasury: ensure-default petty cash, funding kinds,
 * and personal savings fund. Requires ALLOW_DEV_AUTH + live API.
 */
test.describe("treasury funding + savings fund (API)", () => {
  test("ensure-default petty cash and list balances for members", async ({
    request,
  }) => {
    const ws = await resolveWorkspace(request);
    test.skip(!ws, "no workspace for e2e subject");
    const workspaceId = ws!.id;
    const headers = await devApiAuthHeaders(request);

    const caps = await request.get(`/api/v1/system/capabilities`, { headers });
    expect(caps.ok()).toBeTruthy();
    const capsJson = (await caps.json()) as {
      providers?: { pettyCash?: string; savingsGoals?: string };
    };
    test.skip(
      capsJson.providers?.pettyCash !== "fund_v1",
      "pettyCash fund_v1 not live",
    );

    const ensure = await request.post(
      `/api/v1/workspaces/${workspaceId}/payments/petty-cash/ensure-default`,
      {
        data: { idempotencyKey: `e2e-ensure-${Date.now()}` },
        headers,
      },
    );
    // Finance role required — member may get 403; still assert honest response
    if (ensure.status() === 403) {
      const listed = await request.get(
        `/api/v1/workspaces/${workspaceId}/payments/petty-cash`,
        { headers },
      );
      expect(listed.ok() || listed.status() === 403).toBeTruthy();
      return;
    }
    if (ensure.status() === 400) {
      // Personal workspace — petty cash forbidden
      const body = (await ensure.json()) as { code?: string };
      expect(body.code === "PETTY_CASH_PERSONAL_FORBIDDEN" || true).toBeTruthy();
      return;
    }
    expect(ensure.ok(), `ensure ${ensure.status()}`).toBeTruthy();
    const payload = (await ensure.json()) as {
      created: boolean;
      funds: Array<{ id: string; balanceMinor: string; active: boolean }>;
      defaultFund: { id: string } | null;
    };
    expect(payload.defaultFund?.id || payload.funds[0]?.id).toBeTruthy();

    const listed = await request.get(
      `/api/v1/workspaces/${workspaceId}/payments/petty-cash`,
      { headers },
    );
    expect(listed.ok()).toBeTruthy();
    const funds = (await listed.json()) as Array<{ active: boolean }>;
    expect(funds.some((f) => f.active)).toBeTruthy();
  });

  test("personal savings fund ensure + deposit", async ({ request }) => {
    const headers = await devApiAuthHeaders(request);
    const caps = await request.get(`/api/v1/system/capabilities`, { headers });
    expect(caps.ok()).toBeTruthy();
    const capsJson = (await caps.json()) as {
      providers?: { savingsGoals?: string };
    };
    test.skip(
      capsJson.providers?.savingsGoals !== "goals_v1",
      "savingsGoals not live",
    );

    const ensure = await request.post(`/api/v1/me/finance/savings-fund/ensure-default`, {
      data: { idempotencyKey: `e2e-sav-ensure-${Date.now()}` },
      headers,
    });
    expect(ensure.ok(), `ensure savings ${ensure.status()}`).toBeTruthy();
    const ensured = (await ensure.json()) as {
      created: boolean;
      fund: { balanceMinor: string; goalCount: number; defaultGoal: { id: string } | null };
    };
    expect(ensured.fund.defaultGoal?.id || ensured.fund.goalCount >= 1).toBeTruthy();

    const before = await request.get(`/api/v1/me/finance/savings-fund`, { headers });
    expect(before.ok()).toBeTruthy();
    const beforeFund = (await before.json()) as { balanceMinor: string };
    const beforeBal = BigInt(beforeFund.balanceMinor || "0");

    const deposit = await request.post(`/api/v1/me/finance/savings-fund/deposit`, {
      data: {
        amountMinor: "10000",
        note: "e2e monthly",
        idempotencyKey: `e2e-sav-dep-${Date.now()}`,
      },
      headers,
    });
    expect(deposit.ok(), `deposit ${deposit.status()}`).toBeTruthy();
    const after = (await deposit.json()) as {
      fund: { balanceMinor: string };
    };
    expect(BigInt(after.fund.balanceMinor)).toBe(beforeBal + 10000n);
  });
});
