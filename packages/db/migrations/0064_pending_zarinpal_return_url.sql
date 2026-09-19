-- Additive: store return_url for Zarinpal browser redirect after callback.
ALTER TABLE finance.pending_zarinpal_payment
  ADD COLUMN IF NOT EXISTS return_url text;
