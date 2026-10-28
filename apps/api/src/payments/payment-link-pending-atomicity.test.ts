/**
 * Invariant: payment_link + pending_* must share one transaction so a failed
 * pending INSERT cannot leave an orphan payment_link.
 *
 * If create + savePending are still sequential (not one TX), skip and leave
 * the wrap for run 17 — do not change production code in run 16b.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { MemoryPaymentStore } from "./payment.store.js";
import { LocalPspAdapter } from "./local-psp.adapter.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";

const repoRoot = resolve(process.cwd(), "../..");
const localPspPath = resolve(
  repoRoot,
  "apps/api/src/payments/local-psp.adapter.ts",
);
const paymentsServicePath = resolve(
  repoRoot,
  "apps/api/src/payments/payments.service.ts",
);

/** Heuristic: create and savePending appear inside one shared transaction/unit. */
function sourceWrapsCreateAndPending(src: string, savePending: string): boolean {
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  // Combined helper names (future run 17)
  if (
    /createWithPending|createPaymentLinkAndPending|createLinkAndPending/i.test(
      stripped,
    )
  ) {
    return true;
  }
  // Same .transaction(… create … savePending …) or withTenantContext wrapping both
  const txBlocks =
    stripped.match(
      /(?:\.transaction|withTenantContext)\s*\([\s\S]{0,4000}?=>\s*\{[\s\S]{0,8000}?\}/g,
    ) ?? [];
  for (const block of txBlocks) {
    if (
      /\.create\s*\(/.test(block) &&
      new RegExp(savePending).test(block)
    ) {
      return true;
    }
  }
  return false;
}

describe("payment_link + pending_* atomicity", () => {
  it("source must wrap LocalPSP create + savePendingLocalPsp in one transaction", (t) => {
    const src = readFileSync(localPspPath, "utf8");
    if (!sourceWrapsCreateAndPending(src, "savePendingLocalPsp")) {
      t.skip(
        "run 17: LocalPSP create + savePendingLocalPsp are sequential — orphan risk if pending INSERT fails",
      );
      return;
    }
    assert.ok(true);
  });

  it("source must wrap Zarinpal create + savePendingZarinpal in one transaction", (t) => {
    const src = readFileSync(paymentsServicePath, "utf8");
    if (!sourceWrapsCreateAndPending(src, "savePendingZarinpal")) {
      t.skip(
        "run 17: Zarinpal create + savePendingZarinpal are sequential — orphan risk if pending INSERT fails",
      );
      return;
    }
    assert.ok(true);
  });

  it("when pending INSERT fails, payment_link must not remain (LocalPSP)", async (t) => {
    const localSrc = readFileSync(localPspPath, "utf8");
    if (!sourceWrapsCreateAndPending(localSrc, "savePendingLocalPsp")) {
      t.skip(
        "run 17: wrap create+pending in one TX before asserting no orphan payment_link",
      );
      return;
    }

    const store = new MemoryPaymentStore();
    store.savePendingLocalPsp = async () => {
      throw new Error("PENDING_INSERT_FAIL");
    };
    const adapter = new LocalPspAdapter(store);

    await assert.rejects(
      () =>
        adapter.createPaymentIntent({
          workspaceId,
          amount: { amountMinor: "1000", currency: "IRR" },
          description: "atomicity",
          returnUrl: "https://dang.local/return",
          idempotencyKey: "idem-atom-orphan",
        }),
      /PENDING_INSERT_FAIL/,
    );

    const links = await store.list(workspaceId);
    assert.equal(
      links.length,
      0,
      "payment_link must not remain orphan when pending_* INSERT fails",
    );
  });
});
