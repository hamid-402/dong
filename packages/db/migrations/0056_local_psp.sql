-- LocalPSP primary payment path (R10-21 depth): server-owned intents.
ALTER TYPE "finance"."payment_provider" ADD VALUE IF NOT EXISTS 'local_psp';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS finance.pending_local_psp_payment (
  intent_id text PRIMARY KEY,
  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'IRR',
  description text NOT NULL,
  return_url text NOT NULL,
  workspace_id uuid NOT NULL,
  payment_link_id uuid,
  status text NOT NULL DEFAULT 'pending',
  ref_id text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  verified_at timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE finance.pending_local_psp_payment
  ADD CONSTRAINT pending_local_psp_amount_positive
  CHECK (amount_minor > 0);
--> statement-breakpoint
ALTER TABLE finance.pending_local_psp_payment
  ADD CONSTRAINT pending_local_psp_status_chk
  CHECK (status IN ('pending', 'verified'));
--> statement-breakpoint
ALTER TABLE finance.pending_local_psp_payment
  ADD CONSTRAINT pending_local_psp_workspace_fk
  FOREIGN KEY (workspace_id) REFERENCES iam.workspace(id)
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE finance.pending_local_psp_payment
  ADD CONSTRAINT pending_local_psp_payment_link_fk
  FOREIGN KEY (payment_link_id) REFERENCES finance.payment_link(id)
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS pending_local_psp_workspace_idx
  ON finance.pending_local_psp_payment USING btree (workspace_id);
-- Intentionally no RLS: checkout/verify use intentId as capability token.
