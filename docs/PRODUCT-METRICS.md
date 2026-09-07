# متریک‌های محصول (Product Metrics)



> اصل پروژه: هیچ عدد/نرخ/داشبوردی بدون منبع runtime واقعی نمایش داده نمی‌شود

> (رجوع به `.cursor/rules/no-fake-data.mdc`).



## وضعیت فعلی



- [x] رویدادهای audit برای `workspace.create`، `invite.accept`، `expense.post`، `settlement.claim.confirm`

- [x] endpoint شمارش قیف: `GET /workspaces/:workspaceId/product-metrics`

- [x] صفحهٔ داخلی: `/w/[slug]/metrics` (فقط شمارش و milestone از audit؛ بدون نرخ ثابت)

- [ ] sink جداگانهٔ `product_events` (اختیاری بلندمدت)



## منبع داده



Aggregation خالص روی رویدادهای قابل‌خواندن عضو در `AUDIT_STORE` (memory یا Postgres).

نرخ تبدیل / retention ساخته نمی‌شود مگر اینکه بعداً با تعریف صریح از همین شمارش‌ها مشتق شود و در UI برچسب «مشتق از audit» داشته باشد.



## رویداد ↔ milestone



| milestone | action منبع |

| --- | --- |

| ساخت فضا | `workspace.create` |

| پذیرش دعوت | `invite.accept` |

| اولین خرج روی مانده | `expense.post` (اولین success) |

| تسویه تکمیل‌شده | `settlement.claim.confirm` |



## قانون نمایش UI



1. فقط پاسخ API واقعی.

2. `eventCount === 0` → EmptyState صادقانه، نه صفر جعلی به‌عنوان «آمار».

3. برچسب persistence از فیلد `auditPersistence` همان پاسخ.

