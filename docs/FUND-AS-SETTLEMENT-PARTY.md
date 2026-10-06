/**
 * Fund-as-settlement-party (تنخواه به‌عنوان طرف حساب)
 * ----------------------------------------------------------------------
 * Flag: ENABLE_FUND_AS_SETTLEMENT_PARTY → productFlags.fundAsSettlementParty
 *
 * Mental model
 * - Spend from fund → members owe the fund (top up تنخواه).
 * - Pay from personal → members owe the fund; payer is reimbursable from the fund
 *   after own share (and prior debt nets naturally on fund party balances).
 * - Classic member↔member journal remains when flag is off or no fund id.
 *
 * Shared labels (contracts)
 * - `fundingSourceKindLabelFa` — short source for Excel / invoice / print column
 * - `statementFundingNoteFa` — per-member settlement note on statement lines
 * - `formatFundPartyRebuildSummaryFa` — human summary of rebuild API result
 *
 * Rollout phases
 * 0 Flag + account helpers + journal builders + unit tests
 * 1 Ledger stores pass flag; expense post uses fund rules
 * 2 Balances / simplify / settlement claims accept fund:{id} parties
 * 3 UI: settlement labels, balance cards, debt suggestions
 * 4 Statements / invoices: funding explanation + line transparency
 * 5 Rebuild: POST …/expenses/rebuild-fund-party-journals
 *   - Zod body (`force`), typed result with skip breakdown
 *   - Finance-manager UI: FundSettlementRebuildPanel (AppModal, optional force)
 *   - Idempotent by default; force re-writes existing fund:* journals
 *
 * Cash (petty_cash_movement) stays the treasury cash book; journal fund:* is
 * receivables/payables vs members — not a double count of the same number.
 */
export {};
