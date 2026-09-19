# Platform SaaS billing (R10-21)



| فیلد | مقدار |

|------|--------|

| وضعیت | metering واقعی + صورتحساب اشتراک + پرداخت با LocalPSP (یا زرین‌پال زنده) |

| capabilities | `providers.saasBilling=metering_v1` · `providers.payment=local_psp\|zarinpal` |



## جدا از صورتحساب اعضا



| دامنه | مسیر |

|-------|------|

| صورتحساب عضو گروه (خرج دوره) | `/workspaces/:id/periods` · `/invoices` |

| اشتراک پلتفرم (SaaS) | `/workspaces/:id/saas/*` |



## Metering (واقعی)



`GET …/saas/usage` از:



- تعداد اعضا (`iam.members`)

- تعداد خرج `posted` در ماه UTC جاری (`expense` store)

- پلن فعلی (`workspace_plan`)



عدد ساختگی یا نرخ تبدیل جعلی ندارد.



## صورتحساب اشتراک



- قیمت از کاتالوگ `SAAS_PLAN_PRICE_IRR_MINOR` (پیکربندی محصول)

- `POST …/saas/invoices` ⇒ status=`issued`

- فیلد `payable=true` وقتی `providers.payment` برابر `local_psp` یا `zarinpal`

- `POST …/saas/invoices/:id/pay` ⇒ لینک LocalPSP (پیش‌فرض) یا زرین‌پال



## Checkout / verify



| مسیر | نقش |

|------|-----|

| LocalPSP | `checkoutUrl` → `/payments/local/checkout?intentId=` · `POST /api/v1/payments/local/intents/:id/verify` |

| Zarinpal | فقط با `ZARINPAL_MERCHANT_ID` + `ZARINPAL_ENABLED=1` |



مبلغ همیشه سرورمحور است؛ بدنهٔ verify مبلغ را عوض نمی‌کند.



## Callback / follow-on



پس از verify، اگر `payment_link` به `saas.subscription_payment_map` وصل باشد:



1. صورتحساب اشتراک → `paid`

2. پلن فضا → `targetPlan` (`applyPlanFromSubscription`)



تسویهٔ لینک‌شده و صورتحساب عضو هم از همان مسیر ژورنال درگاه تأیید می‌شوند.



## مهاجرت



- `packages/db/migrations/0043_saas_billing.sql` — schema `saas`

- `packages/db/migrations/0056_local_psp.sql` — `pending_local_psp_payment` + enum `local_psp` (journal tag `0056_local_psp`)



## خارج از برش



- Proration / trial / seat overage billing

- IdPay و PSPهای دیگر

- Self-serve portal مشتری


