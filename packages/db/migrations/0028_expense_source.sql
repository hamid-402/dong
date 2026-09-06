-- Additive: provenance for expenses created via daily ledger (vs classic finance UI).
ALTER TABLE finance.expense
  ADD COLUMN IF NOT EXISTS "source" text;

CREATE INDEX IF NOT EXISTS expense_workspace_source_idx
  ON finance.expense (workspace_id, source)
  WHERE source IS NOT NULL;
