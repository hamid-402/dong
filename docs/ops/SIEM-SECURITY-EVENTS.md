# SIEM / structured security events (R10-15)

| فیلد | مقدار |
|------|--------|
| وضعیت | برش ۲ — structured JSON logs + local store |
| capabilities | `persistence.securityEvents = memory \| postgres` · `providers.securityEvents = structured_log \| structured_log_store` |

## چه چیزی هست

رویدادهای امنیتی به‌صورت JSON روی stdout (سرویس `dang-security-events`) با فیلد `securityEvent: true` نوشته می‌شوند تا log shipper / SIEM بیرونی آن‌ها را جمع کند.

هم‌زمان در **حلقهٔ حافظه** و در صورت `DATABASE_URL` در جدول `ops.security_event` (migration `0057`) ذخیره می‌شوند. کنسول platform از همین store با cursor و فیلتر `category` / `severity` می‌خواند.

رویدادهای این برش:

| نام | منبع |
|-----|------|
| `auth.login_failed` | ورود ناموفق |
| `auth.rate_limited` | محدودیت نرخ ورود/ثبت‌نام/بازیابی |
| `auth.account_anonymized` | حذف/ناشناس‌سازی حساب |
| `privacy.data_exported` | export دادهٔ حساب |
| `access.maker_checker_denied` | رد چهارچشم |
| `access.policy_denied` | رد ABAC/`requireAccess` |
| `access.break_glass_opened` | باز شدن break-glass |
| `access.break_glass_revoked` | لغو break-glass |
| `fraud.settlement_anomaly` | anomaly تسویه |
| `fraud.invite_anomaly` | anomaly دعوت |

## API

`GET /platform/security-events?cursor=&category=&severity=` — فقط platform_owner / platform_support (غیرپلتفرم → ۴۰۴).

## نگهداری / retention

- لاگ‌های امنیتی در محیط تولید حداقل **۹۰ روز** در collector نگه داشته شوند (سیاست پیشنهادی؛ پیکربندی زیرساخت شما).
- ردیف‌های `ops.security_event` محصولی‌اند؛ purge/retention جدا از collector.
- PII در `attrs` ممنوع است (ایمیل خام ننویسید؛ فقط `ip` / کد دلیل).

## نمونه خط لاگ

```json
{"ts":"…","level":"warn","service":"dang-security-events","message":"security.event","securityEvent":true,"event":"auth.rate_limited","category":"auth","severity":"high",…}
```

## خارج از برش

- داشبورد SIEM داخل محصول (فقط کنسول platform)
- اتصال مستقیم Splunk/ELK/Datadog (فقط قرارداد لاگ + store محلی)
- correlation ruleهای آمادهٔ SOC
