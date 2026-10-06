-- Ops kinds for personal money_txn + investment accounts.
ALTER TYPE "personal"."money_txn_kind" ADD VALUE IF NOT EXISTS 'investment';
ALTER TYPE "personal"."money_txn_kind" ADD VALUE IF NOT EXISTS 'installment';

ALTER TYPE "personal"."money_account_kind" ADD VALUE IF NOT EXISTS 'investment';
