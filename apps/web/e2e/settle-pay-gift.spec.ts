import { test, expect } from "@playwright/test";
import { resolveWorkspace, devApiAuthHeaders, seedDemoWorkspace } from "./helpers/dev-session";

/**
 * S12 golden path (API): debt → settle_and_fund_gift → claim + gift movement.
 * Requires ALLOW_DEV_AUTH + live API. Skips honestly when prerequisites missing.
 */
test.describe("settle-pay + fund gift (API golden path)", () => {
  test("preview and apply settle_and_fund_gift without shared expense on gift", async ({
    request,
  }) => {
    const headers = await devApiAuthHeaders(request);
    let ws = await resolveWorkspace(request);
    if (!ws) {
      const seeded = await seedDemoWorkspace(request);
      test.skip(!seeded, "Need demo seed or PLAYWRIGHT_WORKSPACE_SLUG");
      ws = { id: seeded!.id, slug: seeded!.slug, source: "seed" };
    }
    const workspaceId = ws.id;

    const caps = await request.get(`/api/v1/system/capabilities`, { headers });
    expect(caps.ok()).toBeTruthy();
    const capsJson = (await caps.json()) as {
      providers?: { pettyCash?: string };
    };
    test.skip(
      capsJson.providers?.pettyCash !== "fund_v1",
      "pettyCash fund_v1 not live",
    );

    const meRes = await request.get(`/api/v1/auth/me`, { headers });
    expect(meRes.ok()).toBeTruthy();
    const me = (await meRes.json()) as { actor: { userId: string } };
    const myId = me.actor.userId;

    const membersRes = await request.get(
      `/api/v1/workspaces/${workspaceId}/members`,
      { headers },
    );
    expect(membersRes.ok()).toBeTruthy();
    const members = (await membersRes.json()) as Array<{
      userId: string;
      role: string;
    }>;
    const counterparty = members.find((m) => m.userId !== myId);
    test.skip(!counterparty, "Need at least two workspace members");

    const ensure = await request.post(
      `/api/v1/workspaces/${workspaceId}/payments/petty-cash/ensure-default`,
      {
        data: { idempotencyKey: `e2e-settle-ensure-${Date.now()}` },
        headers,
      },
    );
    if (ensure.status() === 400) {
      const body = (await ensure.json()) as { code?: string };
      test.skip(
        body.code === "PETTY_CASH_PERSONAL_FORBIDDEN",
        "personal workspace has no shared petty cash",
      );
    }
    if (ensure.status() === 403) {
      const listed = await request.get(
        `/api/v1/workspaces/${workspaceId}/payments/petty-cash`,
        { headers },
      );
      test.skip(!listed.ok(), "finance role required to ensure fund; no funds listed");
    } else {
      expect(ensure.ok(), `ensure ${ensure.status()}`).toBeTruthy();
    }

    const fundsRes = await request.get(
      `/api/v1/workspaces/${workspaceId}/payments/petty-cash`,
      { headers },
    );
    expect(fundsRes.ok()).toBeTruthy();
    const funds = (await fundsRes.json()) as Array<{
      id: string;
      active: boolean;
      balanceMinor: string;
    }>;
    const fund = funds.find((f) => f.active);
    test.skip(!fund, "no active petty cash fund");

    const stamp = Date.now();
    const balRes = await request.get(
      `/api/v1/workspaces/${workspaceId}/balances`,
      { headers },
    );
    expect(balRes.ok()).toBeTruthy();
    const balBody = (await balRes.json()) as {
      lines: Array<{ userId: string; net: { amountMinor: string } }>;
    };
    const myNet = BigInt(
      balBody.lines.find((l) => l.userId === myId)?.net.amountMinor ?? "0",
    );

    if (myNet >= 0n) {
      const expense = await request.post(
        `/api/v1/workspaces/${workspaceId}/expenses`,
        {
          headers,
          data: {
            workspaceId,
            title: `e2e settle-pay debt ${stamp}`,
            total: { amountMinor: "200000", currency: "IRR" },
            paidByUserId: counterparty!.userId,
            splitMethod: "equal",
            participantUserIds: [myId, counterparty!.userId],
            occurredOn: new Date().toISOString().slice(0, 10),
            visibility: "shared",
            requiresApproval: false,
            commit: "auto",
            idempotencyKey: `e2e-settle-exp-${stamp}`,
          },
        },
      );
      if (!expense.ok()) {
        test.skip(
          true,
          `could not seed debtor expense (${expense.status()}) — need posted debt for settle_and_fund_gift`,
        );
      }
      const expBody = (await expense.json()) as { status?: string };
      test.skip(
        expBody.status !== "posted",
        `expense not posted (status=${expBody.status})`,
      );
    }

    const fundsBefore = await request.get(
      `/api/v1/workspaces/${workspaceId}/payments/petty-cash`,
      { headers },
    );
    expect(fundsBefore.ok()).toBeTruthy();
    const fundsFresh = (await fundsBefore.json()) as Array<{
      id: string;
      active: boolean;
      balanceMinor: string;
    }>;
    const fundFresh = fundsFresh.find((f) => f.id === fund!.id) ?? fund!;
    const beforeFundBal = BigInt(fundFresh.balanceMinor);

    const preview = await request.post(
      `/api/v1/workspaces/${workspaceId}/payments/settle-pay`,
      {
        headers,
        data: {
          counterpartyUserId: counterparty!.userId,
          amountMinor: "150000",
          intent: "settle_and_fund_gift",
          fundId: fund!.id,
          previewOnly: true,
          idempotencyKey: `e2e-settle-preview-${stamp}`,
        },
      },
    );
    expect(preview.ok(), `preview ${preview.status()}`).toBeTruthy();
    const previewBody = (await preview.json()) as {
      previewOnly: boolean;
      plan: {
        settlementAmountMinor: string;
        giftAmountMinor: string;
        suggestedSettleMinor: string;
      };
    };
    expect(previewBody.previewOnly).toBe(true);
    expect(BigInt(previewBody.plan.suggestedSettleMinor)).toBeGreaterThan(0n);
    expect(
      BigInt(previewBody.plan.settlementAmountMinor) +
        BigInt(previewBody.plan.giftAmountMinor),
    ).toBe(150000n);

    const apply = await request.post(
      `/api/v1/workspaces/${workspaceId}/payments/settle-pay`,
      {
        headers,
        data: {
          counterpartyUserId: counterparty!.userId,
          amountMinor: "150000",
          intent: "settle_and_fund_gift",
          fundId: fund!.id,
          idempotencyKey: `e2e-settle-apply-${stamp}`,
        },
      },
    );
    expect(apply.ok(), `apply ${apply.status()}`).toBeTruthy();
    const applied = (await apply.json()) as {
      previewOnly: boolean;
      plan: { settlementAmountMinor: string; giftAmountMinor: string };
      settlement?: { id: string; status: string; amount: { amountMinor: string } };
      gift?: {
        balanceMinor: string;
        movement: { kind: string; expenseId?: string };
      };
    };
    expect(applied.previewOnly).toBe(false);
    expect(applied.settlement?.id).toBeTruthy();
    expect(applied.settlement?.status).toBe("claimed");
    expect(applied.gift?.movement.kind).toBe("gift");
    expect(applied.gift?.movement.expenseId).toBeFalsy();
    expect(BigInt(applied.gift!.balanceMinor)).toBe(
      beforeFundBal + BigInt(applied.plan.giftAmountMinor),
    );

    const ledger = await request.get(
      `/api/v1/workspaces/${workspaceId}/payments/petty-cash/${fund!.id}/ledger`,
      { headers },
    );
    if (ledger.ok()) {
      const ledgerBody = (await ledger.json()) as {
        rows: Array<{ kind: string; expenseId?: string }>;
      };
      const giftRow = ledgerBody.rows.find((r) => r.kind === "gift");
      expect(giftRow).toBeTruthy();
      expect(giftRow?.expenseId).toBeFalsy();
    }
  });

  test("fund_gift_only never creates settlement claim", async ({ request }) => {
    const headers = await devApiAuthHeaders(request);
    const ws = await resolveWorkspace(request);
    test.skip(!ws, "no workspace");
    const workspaceId = ws!.id;

    const meRes = await request.get(`/api/v1/auth/me`, { headers });
    expect(meRes.ok()).toBeTruthy();
    const me = (await meRes.json()) as { actor: { userId: string } };

    const membersRes = await request.get(
      `/api/v1/workspaces/${workspaceId}/members`,
      { headers },
    );
    expect(membersRes.ok()).toBeTruthy();
    const members = (await membersRes.json()) as Array<{ userId: string }>;
    const other = members.find((m) => m.userId !== me.actor.userId);
    test.skip(!other, "need counterparty");

    const fundsRes = await request.get(
      `/api/v1/workspaces/${workspaceId}/payments/petty-cash`,
      { headers },
    );
    test.skip(!fundsRes.ok(), "cannot list funds");
    const funds = (await fundsRes.json()) as Array<{ id: string; active: boolean }>;
    const fund = funds.find((f) => f.active);
    test.skip(!fund, "no active fund");

    const stamp = Date.now();
    const res = await request.post(
      `/api/v1/workspaces/${workspaceId}/payments/settle-pay`,
      {
        headers,
        data: {
          counterpartyUserId: other!.userId,
          amountMinor: "25000",
          intent: "fund_gift_only",
          fundId: fund!.id,
          idempotencyKey: `e2e-gift-only-${stamp}`,
        },
      },
    );
    expect(res.ok(), `gift-only ${res.status()}`).toBeTruthy();
    const body = (await res.json()) as {
      settlement?: unknown;
      gift?: { movement: { kind: string } };
      plan: { settlementAmountMinor: string; giftAmountMinor: string };
    };
    expect(body.settlement).toBeFalsy();
    expect(body.plan.settlementAmountMinor).toBe("0");
    expect(body.plan.giftAmountMinor).toBe("25000");
    expect(body.gift?.movement.kind).toBe("gift");
  });
});
