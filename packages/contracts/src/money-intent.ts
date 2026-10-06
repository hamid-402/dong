/**
 * Configurable money intents — substrate for any user-defined financial goal/rule.
 * Home and BI evaluate only intents the actor actually created (no hardcoded examples).
 */

import type { Money } from "./money.js";

export const MONEY_INTENT_KINDS = [
  "save_income_percent",
  "spend_cap_amount",
  "spend_cap_income_percent",
  "debt_open_cap",
  "liquid_floor",
  "net_floor",
  "savings_goal_link",
  "installment_pay_cap",
  "investment_floor",
] as const;

export type MoneyIntentKind = (typeof MONEY_INTENT_KINDS)[number];

export const MONEY_INTENT_PERIODS = ["month", "week", "range"] as const;
export type MoneyIntentPeriod = (typeof MONEY_INTENT_PERIODS)[number];

/** UI/API catalog — drive forms from this, never hardcode one sample rule. */
export type MoneyIntentKindMeta = {
  kind: MoneyIntentKind;
  labelFa: string;
  descriptionFa: string;
  needsAmount: boolean;
  needsPercent: boolean;
  needsGoalId: boolean;
  /** Which pulse metric this rule judges. */
  metric:
    | "savings_rate"
    | "expense"
    | "expense_income_ratio"
    | "settlements"
    | "liquid"
    | "net"
    | "goal_progress"
    | "installments"
    | "investments";
};

export const MONEY_INTENT_KIND_CATALOG: readonly MoneyIntentKindMeta[] = [
  {
    kind: "save_income_percent",
    labelFa: "پس‌انداز درصدی از درآمد",
    descriptionFa: "نرخ خالص÷درآمد در بازه به درصد هدف برسد",
    needsAmount: false,
    needsPercent: true,
    needsGoalId: false,
    metric: "savings_rate",
  },
  {
    kind: "spend_cap_amount",
    labelFa: "سقف خرج مبلغی",
    descriptionFa: "جمع هزینهٔ بازه از مبلغ هدف بیشتر نشود",
    needsAmount: true,
    needsPercent: false,
    needsGoalId: false,
    metric: "expense",
  },
  {
    kind: "spend_cap_income_percent",
    labelFa: "سقف خرج نسبی به درآمد",
    descriptionFa: "هزینه÷درآمد از درصد هدف بیشتر نشود",
    needsAmount: false,
    needsPercent: true,
    needsGoalId: false,
    metric: "expense_income_ratio",
  },
  {
    kind: "debt_open_cap",
    labelFa: "سقف بدهی / تسویه باز",
    descriptionFa: "جمع تسویه‌های باز از مبلغ هدف بیشتر نشود",
    needsAmount: true,
    needsPercent: false,
    needsGoalId: false,
    metric: "settlements",
  },
  {
    kind: "liquid_floor",
    labelFa: "کف مانده حساب‌ها",
    descriptionFa: "ماندهٔ منابع شخصی از مبلغ هدف کمتر نشود",
    needsAmount: true,
    needsPercent: false,
    needsGoalId: false,
    metric: "liquid",
  },
  {
    kind: "net_floor",
    labelFa: "کف خالص بازه",
    descriptionFa: "درآمد−هزینه در بازه حداقل مبلغ هدف باشد",
    needsAmount: true,
    needsPercent: false,
    needsGoalId: false,
    metric: "net",
  },
  {
    kind: "savings_goal_link",
    labelFa: "پیوند به هدف پس‌انداز",
    descriptionFa: "پیشرفت یک هدف پس‌انداز موجود به درصد دلخواه برسد",
    needsAmount: false,
    needsPercent: true,
    needsGoalId: true,
    metric: "goal_progress",
  },
  {
    kind: "installment_pay_cap",
    labelFa: "سقف پرداخت اقساط",
    descriptionFa: "جمع اقساط ثبت‌شده در بازه از مبلغ هدف بیشتر نشود",
    needsAmount: true,
    needsPercent: false,
    needsGoalId: false,
    metric: "installments",
  },
  {
    kind: "investment_floor",
    labelFa: "کف سرمایه‌گذاری بازه",
    descriptionFa: "حداقل مبلغ سرمایه‌گذاری ثبت‌شده در بازه",
    needsAmount: true,
    needsPercent: false,
    needsGoalId: false,
    metric: "investments",
  },
] as const;

export function moneyIntentMeta(kind: MoneyIntentKind): MoneyIntentKindMeta {
  const hit = MONEY_INTENT_KIND_CATALOG.find((m) => m.kind === kind);
  if (!hit) {
    throw new Error(`unknown_money_intent_kind:${kind}`);
  }
  return hit;
}

export type MoneyIntentSummary = {
  id: string;
  name: string;
  kind: MoneyIntentKind;
  period: MoneyIntentPeriod;
  /** Absolute IRR minor when kind needs amount. */
  targetMinor?: string;
  /** 1–100 when kind needs percent. */
  targetPercent?: number;
  /** Linked savings goal for savings_goal_link. */
  goalId?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateMoneyIntentRequest = {
  name: string;
  kind: MoneyIntentKind;
  period?: MoneyIntentPeriod;
  targetMinor?: string;
  targetPercent?: number;
  goalId?: string;
  active?: boolean;
  idempotencyKey: string;
};

export type UpdateMoneyIntentRequest = {
  name?: string;
  period?: MoneyIntentPeriod;
  targetMinor?: string | null;
  targetPercent?: number | null;
  goalId?: string | null;
  active?: boolean;
};

/** Live numbers from dashboard pulse / personal stores — never invented. */
export type MoneyIntentEvalContext = {
  incomeMinor: bigint;
  expenseMinor: bigint;
  netMinor: bigint;
  liquidMinor: bigint;
  openSettleMinor: bigint;
  installmentMinor: bigint;
  investmentMinor: bigint;
  goals: ReadonlyArray<{
    id: string;
    name: string;
    progressPercent: number;
    target: Money;
    contributed: Money;
  }>;
};

export type MoneyIntentEvaluation = {
  intentId: string;
  name: string;
  kind: MoneyIntentKind;
  kindLabelFa: string;
  /** null when metric cannot be judged (e.g. income=0 for %-of-income rules). */
  met: boolean | null;
  actualLabel: string;
  targetLabel: string;
  /** 0–100+ UI bar when meaningful; null when not comparable as percent. */
  progressPercent: number | null;
  gapMinor?: string;
  hrefHint: "me-finance" | "settlements" | "charts";
};

function pctOf(numer: bigint, denom: bigint): number | null {
  if (denom <= 0n) return null;
  return Math.round(Number((numer * 10000n) / denom) / 100);
}

function formatMinor(minor: bigint): string {
  return minor.toString();
}

/**
 * Validate create/update payload against kind catalog (pure).
 * Throws Error with stable code for API mapping.
 */
export function assertMoneyIntentPayload(input: {
  kind: MoneyIntentKind;
  name: string;
  targetMinor?: string | null;
  targetPercent?: number | null;
  goalId?: string | null;
}): void {
  const name = input.name.trim();
  if (!name) throw new Error("INTENT_NAME");
  const meta = moneyIntentMeta(input.kind);
  if (meta.needsAmount) {
    if (input.targetMinor == null || !/^\d+$/.test(input.targetMinor) || BigInt(input.targetMinor) <= 0n) {
      throw new Error("INTENT_AMOUNT");
    }
  }
  // needsAmount already covers installment_pay_cap / investment_floor via catalog
  if (meta.needsPercent) {
    const p = input.targetPercent;
    if (p == null || !Number.isFinite(p) || p < 1 || p > 100) {
      throw new Error("INTENT_PERCENT");
    }
  }
  if (meta.needsGoalId) {
    if (!input.goalId?.trim()) throw new Error("INTENT_GOAL");
  }
}

/** Evaluate one configured intent against live context. */
export function evaluateMoneyIntent(
  intent: MoneyIntentSummary,
  ctx: MoneyIntentEvalContext,
): MoneyIntentEvaluation {
  const meta = moneyIntentMeta(intent.kind);
  const base = {
    intentId: intent.id,
    name: intent.name,
    kind: intent.kind,
    kindLabelFa: meta.labelFa,
  };

  switch (intent.kind) {
    case "save_income_percent": {
      const target = Math.floor(intent.targetPercent ?? 0);
      const actual = pctOf(ctx.netMinor, ctx.incomeMinor);
      if (actual == null) {
        return {
          ...base,
          met: null,
          actualLabel: "بدون درآمد در بازه قابل سنجش نیست",
          targetLabel: `${target}٪ درآمد`,
          progressPercent: null,
          hrefHint: "me-finance",
        };
      }
      const need = (ctx.incomeMinor * BigInt(target)) / 100n;
      const saved = ctx.netMinor > 0n ? ctx.netMinor : 0n;
      const gap = need > saved ? need - saved : 0n;
      return {
        ...base,
        met: actual >= target,
        actualLabel: `${actual}٪`,
        targetLabel: `${target}٪ درآمد`,
        progressPercent: Math.min(999, Math.round((actual / target) * 100)),
        gapMinor: gap > 0n ? formatMinor(gap) : undefined,
        hrefHint: "me-finance",
      };
    }
    case "spend_cap_amount": {
      const cap = BigInt(intent.targetMinor ?? "0");
      const used = ctx.expenseMinor;
      const met = used <= cap;
      const gap = used > cap ? used - cap : 0n;
      return {
        ...base,
        met,
        actualLabel: formatMinor(used),
        targetLabel: `سقف ${formatMinor(cap)}`,
        progressPercent: cap > 0n ? Number((used * 100n) / cap) : null,
        gapMinor: gap > 0n ? formatMinor(gap) : undefined,
        hrefHint: "me-finance",
      };
    }
    case "spend_cap_income_percent": {
      const target = Math.floor(intent.targetPercent ?? 0);
      const actual = pctOf(ctx.expenseMinor, ctx.incomeMinor);
      if (actual == null) {
        return {
          ...base,
          met: null,
          actualLabel: "بدون درآمد در بازه قابل سنجش نیست",
          targetLabel: `حداکثر ${target}٪ درآمد`,
          progressPercent: null,
          hrefHint: "me-finance",
        };
      }
      return {
        ...base,
        met: actual <= target,
        actualLabel: `${actual}٪`,
        targetLabel: `حداکثر ${target}٪ درآمد`,
        progressPercent: Math.min(999, Math.round((actual / Math.max(target, 1)) * 100)),
        hrefHint: "me-finance",
      };
    }
    case "debt_open_cap": {
      const cap = BigInt(intent.targetMinor ?? "0");
      const used = ctx.openSettleMinor;
      const met = used <= cap;
      const gap = used > cap ? used - cap : 0n;
      return {
        ...base,
        met,
        actualLabel: formatMinor(used),
        targetLabel: `سقف ${formatMinor(cap)}`,
        progressPercent: cap > 0n ? Number((used * 100n) / cap) : null,
        gapMinor: gap > 0n ? formatMinor(gap) : undefined,
        hrefHint: "settlements",
      };
    }
    case "liquid_floor": {
      const floor = BigInt(intent.targetMinor ?? "0");
      const have = ctx.liquidMinor;
      const met = have >= floor;
      const gap = floor > have ? floor - have : 0n;
      return {
        ...base,
        met,
        actualLabel: formatMinor(have),
        targetLabel: `حداقل ${formatMinor(floor)}`,
        progressPercent: floor > 0n ? Number((have * 100n) / floor) : null,
        gapMinor: gap > 0n ? formatMinor(gap) : undefined,
        hrefHint: "me-finance",
      };
    }
    case "net_floor": {
      const floor = BigInt(intent.targetMinor ?? "0");
      const have = ctx.netMinor;
      const met = have >= floor;
      const gap = floor > have ? floor - have : 0n;
      return {
        ...base,
        met,
        actualLabel: formatMinor(have),
        targetLabel: `حداقل ${formatMinor(floor)}`,
        progressPercent: floor > 0n ? Number((have * 100n) / floor) : null,
        gapMinor: gap > 0n ? formatMinor(gap) : undefined,
        hrefHint: "charts",
      };
    }
    case "savings_goal_link": {
      const target = Math.floor(intent.targetPercent ?? 0);
      const goal = ctx.goals.find((g) => g.id === intent.goalId);
      if (!goal) {
        return {
          ...base,
          met: null,
          actualLabel: "هدف پس‌انداز پیوندی یافت نشد",
          targetLabel: `${target}٪ پیشرفت`,
          progressPercent: null,
          hrefHint: "me-finance",
        };
      }
      const actual = goal.progressPercent;
      return {
        ...base,
        met: actual >= target,
        actualLabel: `${goal.name}: ${actual}٪`,
        targetLabel: `${target}٪ پیشرفت`,
        progressPercent: Math.min(999, Math.round((actual / Math.max(target, 1)) * 100)),
        hrefHint: "me-finance",
      };
    }

    case "installment_pay_cap": {
      const cap = BigInt(intent.targetMinor ?? "0");
      const used = ctx.installmentMinor;
      const met = used <= cap;
      const gap = used > cap ? used - cap : 0n;
      return {
        ...base,
        met,
        actualLabel: formatMinor(used),
        targetLabel: `سقف ${formatMinor(cap)}`,
        progressPercent: cap > 0n ? Number((used * 100n) / cap) : null,
        gapMinor: gap > 0n ? formatMinor(gap) : undefined,
        hrefHint: "me-finance",
      };
    }
    case "investment_floor": {
      const floor = BigInt(intent.targetMinor ?? "0");
      const have = ctx.investmentMinor;
      const met = have >= floor;
      const gap = floor > have ? floor - have : 0n;
      return {
        ...base,
        met,
        actualLabel: formatMinor(have),
        targetLabel: `حداقل ${formatMinor(floor)}`,
        progressPercent: floor > 0n ? Number((have * 100n) / floor) : null,
        gapMinor: gap > 0n ? formatMinor(gap) : undefined,
        hrefHint: "me-finance",
      };
    }
  }
}

export function evaluateActiveMoneyIntents(
  intents: readonly MoneyIntentSummary[],
  ctx: MoneyIntentEvalContext,
): MoneyIntentEvaluation[] {
  return intents.filter((i) => i.active).map((i) => evaluateMoneyIntent(i, ctx));
}
