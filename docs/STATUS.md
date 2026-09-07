# وضعیت اجرای پروژه

آخرین به‌روزرسانی: ۷ سپتامبر ۲۰۲۶ — Dong 2.0 waves + UX honesty روی `ship/dong-2-finish`

## جواب

**نقشه فنی ۰–۵ و Dong 2.۰ (موج‌های ۰–F) در کد بسته‌اند.** polish UX: مسیرهای مالی جدا، More/palette پرچم‌صادق، `/org-finance`، نقش فقط‌خواندنی روی فرم‌های جهش، جدول FX بدون تبدیل زنده.

فاز ۴ محصولی (کلید واقعی PSP/SMTP/AV/OCR و تبدیل FX / شارژ اشتراک) فقط با پیکربندی و provider واقعی — بدون UI جعلی.

### تکمیل‌شده (فنی)
- Zod روی همه `@Body()` · CI + branch protection · fail-closed AV
- Zero-sum ledger · Argon2id · Redis rate-limit/idempotency/DLQ
- MFA/TOTP + recovery · a11y smoke · bundle budget · license check · Storybook · i18n scaffold
- مسیر مشتری / IA — `docs/IA.md` (`/w/[slug]/…`، `/members`، `/org-finance`)
- داشبورد workspace/personal با aggregate واقعی (`/workspaces/:id/dashboard`, `/me/dashboard`)
- guest/auditor: مخفی‌سازی جهش در مالی، گروه، org، تدارکات، پیشنهاد، گزارش/تکرار

### عمداً باز (کلید / عملیات شما)
- `ZARINPAL_ENABLED` / `CLAMAV_ENABLED` / `EMAIL_TRANSPORT=smtp` / `OCR_ENABLED`
- تبدیل زنده FX · شارژ Freemium · Push واقعی · تست نفوذ · پایلوت میدانی

## Runtime
- Web `:3005` · API `:3006` · Redis worker · Postgres
