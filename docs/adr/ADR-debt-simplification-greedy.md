# ADR: Debt simplification uses greedy pairing (not absolute optimum)

## Status

Accepted (Dong 2.0 Wave 0)

## Context

Product docs require a Splitwise-style “simplify debts” path: fewer payments while
preserving each member’s net balance. Finding a globally minimal transfer set is
NP-hard; shipping a correct, explainable algorithm matters more than mathematical
optimality.

We already expose `suggestMinimalSettlements` in `@dang/contracts` and use it in
group / daily-ledger UI. Governance asks for an explicit ADR so later phases do not
replace it with an opaque solver without review.

## Decision

Use the **greedy** algorithm: repeatedly match the largest debtor with the largest
creditor until nets clear.

Three golden invariants (must stay covered by unit tests):

1. **Net preservation** — each member’s net balance after applying suggestions equals
   the net before (only payment *paths* change).
2. **No new debt edges** — nobody owes someone they did not already owe in the
   net-sense graph implied by balances (greedy pairing only routes existing nets).
3. **No increased total obligation** — no member’s total absolute debt increases;
   only consolidation of paths is allowed.

Absolute optimum (min number of payments over all graphs) is **out of scope**.

## Consequences

- Phase C adds a first-class API + UI on top of this function; it does not rewrite
  the algorithm unless invariants fail.
- Any alternative solver needs a new ADR and the same three invariant tests.

## References

- `packages/contracts/src/finance.ts` — `suggestMinimalSettlements`
- `docs/DONG-2.0-PRODUCT.md` §۴.۵
- `docs/DONG-2.0-RECONCILIATION.md` §۲ D7
