-- Pending Zarinpal authorities: amount is server-owned (never trust query-param).
CREATE TABLE IF NOT EXISTS finance.pending_zarinpal_payment (
  authority text PRIMARY KEY,
  amount_minor bigint NOT NULL,
  workspace_id uuid NOT NULL,
  payment_link_id uuid,
  status text NOT NULL DEFAULT 'pending',
  ref_id text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  verified_at timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE finance.pending_zarinpal_payment
  ADD CONSTRAINT pending_zarinpal_amount_positive
  CHECK (amount_minor > 0);
--> statement-breakpoint
ALTER TABLE finance.pending_zarinpal_payment
  ADD CONSTRAINT pending_zarinpal_status_chk
  CHECK (status IN ('pending', 'verified'));
--> statement-breakpoint
ALTER TABLE finance.pending_zarinpal_payment
  ADD CONSTRAINT pending_zarinpal_workspace_fk
  FOREIGN KEY (workspace_id) REFERENCES iam.workspace(id)
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE finance.pending_zarinpal_payment
  ADD CONSTRAINT pending_zarinpal_payment_link_fk
  FOREIGN KEY (payment_link_id) REFERENCES finance.payment_link(id)
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS pending_zarinpal_workspace_idx
  ON finance.pending_zarinpal_payment USING btree (workspace_id);
-- Intentionally no RLS: callback has no tenant session; authority is the capability token.
