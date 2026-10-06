# Threat model — Dong Hamkari (R10-22 برش آماده‌سازی)

| فیلد | مقدار |
|------|--------|
| نسخه | ۲۰۲۶-Q3 / مرحله ۱۰ |
| روش | STRIDE سبک روی دارایی‌های مرزی |
| وضعیت | **مدل داخلی آماده** — تست نفوذ بیرونی هنوز «انجام‌شده» ادعا نمی‌شود |
| خروجی مرتبط | [`PENTEST-SCOPE.md`](./PENTEST-SCOPE.md) · [`PENTEST-REMEDIATION-TRACKER.md`](./PENTEST-REMEDIATION-TRACKER.md) |

## ۱. دارایی‌ها

| دارایی | حساسیت | یادداشت |
|--------|--------|---------|
| Session cookie (`dang_session`) | بالا | HttpOnly · CSRF double-submit |
| TOTP secrets | بالا | AEAD at-rest · چرخش env |
| Ledger / settlements | بحرانی | zero-sum · maker-checker اختیاری |
| Attachments | بالا | quarantine · AV fail-closed |
| Audit hash-chain | بالا | append-only |
| PII حساب (email/name) | بالا | export/anonymize R10-14 |
| Analytics facts | متوسط | schema جدا · RLS |

## ۲. بازیگران تهدید

- مهاجم اینترنتی ناشناس روی `/api/v1`
- عضو بدخواه workspace (افزایش نقش / نشت بین‌مستأجری)
- ادمین سازش‌شدهٔ session
- وابستگی زنجیره تأمین (npm) — خارج از محدودهٔ تست کاربردی مگر توافق جدا

## ۳. STRIDE خلاصه

| تهدید | مثال در Dong | کنترل فعلی | شکاف باز |
|-------|--------------|------------|----------|
| Spoofing | جعل session / DevAuth در prod | session hash · DevAuth خاموش در prod | Vault/KMS (R10-06) |
| Tampering | دستکاری journal | zero-sum · RLS · audit chain | — |
| Repudiation | انکار عمل مالی | audit append-only | SIEM collector بیرونی |
| Info disclosure | نشت tenant دیگر | RLS + isolation tests | ABAC DSL (R10-05 عمق) |
| Denial of service | login flood | rate-limit Redis | soak staging |
| Elevation | guest→finance | role sets · `requireAccess` / `rbac_abac_v5` + deputy cap | remote PDP / field-level |

## ۴. Trust boundaries

1. Browser ↔ Next BFF (`/api/v1/*`) ↔ Nest API
2. API ↔ Postgres (RLS GUC) / Redis / S3-compatible blob
3. API ↔ PSP/OCR/SMTP فقط وقتی `*_ENABLED` و کلید واقعی

## ۵. فرضیات صریح

- تست نفوذ بدون مجوز کتبی روی production ممنوع است.
- یافته‌های ZAP baseline جای تست نفوذ انسانی نیستند.
- `ALLOW_DEV_AUTH=true` فقط محیط غیرproduction.

## ۶. بازبینی

حداقل سالانه یا پس از تغییر بزرگ auth/پرداخت — مالک امنیت محصول.
