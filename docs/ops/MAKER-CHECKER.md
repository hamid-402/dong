# Maker-checker و antifraud سبک (R10-25 / R10-17)



| فیلد | مقدار |

|------|--------|

| وضعیت | برش ۳ + Phase 2.3 — چهارچشم + سطوح تأیید روی hot path + صف نازک |

| پرچم | `ENABLE_MAKER_CHECKER` (چهارچشم/tiers)؛ `ENABLE_APPROVAL_QUEUE` برای سطح صف |

| capabilities | `providers.antifraud=heuristics_v1` · `providers.makerChecker=four_eyes_tiers_v1` وقتی پرچم روشن · `persistence.approvalDecisions` · `providers.makerCheckerSla=hours_v1` وقتی `MAKER_CHECKER_SLA_HOURS` > 0 |



## رفتار



- آستانهٔ چهارچشم (کف): `approvalThresholdMinor` از سیاست خرج workspace، وگرنه `MAKER_CHECKER_THRESHOLD_MINOR`

- اگر مبلغ ≥ آستانه: تأییدکنندهٔ تسویه/خرج نباید همان `createdBy` باشد (`assertFourEyes`)

- پس از کف، `applyTierGate` / `recordTierDecision` با `DEFAULT_APPROVAL_TIERS`:

  - فقط وقتی `status === complete` mutation نهایی می‌شود (approve/confirm)

  - `pending` → همان رکورد با `approvalsHave` / `approvalsNeeded` / `tierApprovalStatus` برمی‌گردد (بدون finalize)

  - `rejected` → تصمیم ثبت می‌شود؛ رکورد تأییدنشده می‌ماند

  - باند تک‌تأییدکننده + خودتأییدی maker (زیر سقف چهارچشم) بدون تغییر رفتار قبلی (`bypass`)

- مسیرها: `expenses.approve` · `settlements.confirm` · `workspace-payments` on-behalf approve

- مرکز تأیید (`GET …/approval-queue`):

  - تسویه‌های `claimed` بالای سقف برای طلبکار/مدیر مالی (نه maker)

  - خرج‌های بالای سقف از صف maker حذف می‌شوند تا بن‌بست خودتأییدی نباشد

  - وقتی مبلغ معلوم است: `approvalsHave` / `approvalsNeeded` از `resolveTier` + decision store

  - وقتی `MAKER_CHECKER_SLA_HOURS` تنظیم شده: `slaDueAt` / `slaBreached` از `createdAt`؛ نقض‌ها اول فهرست

- ایجاد تسویه: `evaluateSettlementAnomaly` → در صورت رد، `fraud.settlement_anomaly`

- ایجاد دعوت: `evaluateInviteAnomaly` → در صورت رد، `fraud.invite_anomaly`

- رد چهارچشم / نقش سطح: `access.maker_checker_denied` (store + structured log)



رویدادها: `access.maker_checker_denied` · `fraud.settlement_anomaly` · `fraud.invite_anomaly`



این برش **heuristics_v1** است — نه مدل ML و نه velocity چندنود.



## خارج از برش



- مدل ML antifraud / velocity Redis چندگره

- داشبورد SOC داخل محصول

- جدول SLA جدا در DB (ساعت از env کافی است؛ breach محاسبه‌ای است)



## سطوح تأیید (Phase 2.3)



ماتریس پیش‌فرض IRR minor: `0→1` تأیید، `10_000_000→2`، `100_000_000→2` با نقش‌های `owner|finance`.

تصمیم‌ها در `finance.approval_decision` چندردیفی‌اند تا `requiredApprovals` برآورده شود.

`assertFourEyes` تک‌نفرهٔ قبلی همچنان کف است؛ `recordTierDecision` روی hot path تأیید چندتصمیمی است.

