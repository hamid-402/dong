/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  readExpenseIdFromUrl,
  readFromLedgerFromUrl,
  readOutingIdFromUrl,
  readPaymentResultFromUrl,
  readSettleAmountFromUrl,
  readSettleToFromUrl,
  stripPaymentResultFromUrl,
} from "./finance-url";

describe("finance-url", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("reads settleTo / settleAmount / expense from query", () => {
    window.history.replaceState(
      {},
      "",
      "/w/x/expenses?settleTo=u1&settleAmount=12000&expense=e9",
    );
    expect(readSettleToFromUrl()).toBe("u1");
    expect(readSettleAmountFromUrl()).toBe("12000");
    expect(readExpenseIdFromUrl()).toBe("e9");
  });

  it("reads from=ledger clarity flag", () => {
    window.history.replaceState({}, "", "/w/x/expenses?from=ledger#quick-expense");
    expect(readFromLedgerFromUrl()).toBe(true);
    window.history.replaceState({}, "", "/w/x/expenses");
    expect(readFromLedgerFromUrl()).toBe(false);
  });

  it("rejects non-numeric settleAmount", () => {
    window.history.replaceState({}, "", "/w/x/expenses?settleAmount=12ab");
    expect(readSettleAmountFromUrl()).toBe("");
  });

  it("reads outing id", () => {
    window.history.replaceState({}, "", "/w/x/expenses?outing=out-1#quick-expense");
    expect(readOutingIdFromUrl()).toBe("out-1");
  });

  it("reads and strips payment return result", () => {
    window.history.replaceState(
      {},
      "",
      "/w/x/expenses?payment=ok&status=OK&refId=99&settleTo=u1#settlement-panel",
    );
    expect(readPaymentResultFromUrl()).toEqual({
      payment: "ok",
      status: "OK",
      refId: "99",
    });
    expect(stripPaymentResultFromUrl()).toBe(
      "/w/x/expenses?settleTo=u1#settlement-panel",
    );
  });

  it("returns null for unknown payment values", () => {
    window.history.replaceState({}, "", "/w/x/expenses?payment=pending");
    expect(readPaymentResultFromUrl()).toBeNull();
  });
});
