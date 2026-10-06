ALTER TYPE "personal"."money_intent_kind" ADD VALUE IF NOT EXISTS 'installment_pay_cap';
ALTER TYPE "personal"."money_intent_kind" ADD VALUE IF NOT EXISTS 'investment_floor';
