-- DB-level backstop: journal lines for an entry must sum debit == credit at COMMIT.
CREATE OR REPLACE FUNCTION accounting.assert_entry_balanced()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  debit_sum bigint;
  credit_sum bigint;
BEGIN
  SELECT
    COALESCE(SUM(amount_minor) FILTER (WHERE side = 'debit'), 0),
    COALESCE(SUM(amount_minor) FILTER (WHERE side = 'credit'), 0)
  INTO debit_sum, credit_sum
  FROM accounting.journal_line
  WHERE entry_id = NEW.entry_id;

  IF debit_sum <> credit_sum THEN
    RAISE EXCEPTION 'JOURNAL_ENTRY_NOT_BALANCED entry_id=% debit=% credit=%',
      NEW.entry_id, debit_sum, credit_sum
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS journal_line_balance_check ON accounting.journal_line;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER journal_line_balance_check
AFTER INSERT ON accounting.journal_line
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION accounting.assert_entry_balanced();
