# وضعیت اجرای پروژه

آخرین به‌روزرسانی: ۶ سپتامبر ۲۰۲۶ — نقشه فنی ۰–۵ (به‌جز کلیدهای زنده)

## جواب

**نقشه فنی ۰–۵ در کد بسته شد** (داشبورد متریک از aggregate واقعی store/DB).

فاز ۴ محصولی (کلید واقعی PSP/SMTP/AV/OCR) فقط با پیکربندی شما فعال می‌شود.

### تکمیل‌شده (فنی)
- Zod روی همه `@Body()` · CI + branch protection · fail-closed AV
- Zero-sum ledger · Argon2id · Redis rate-limit/idempotency/DLQ
- MFA/TOTP + recovery · a11y smoke · bundle budget · license check · Storybook · i18n scaffold
- مسیر مشتری / IA — `docs/IA.md`
- داشبورد workspace/personal با aggregate واقعی (`/workspaces/:id/dashboard`, `/me/dashboard`)

### عمداً باز (کلید / عملیات شما)
- `ZARINPAL_ENABLED` / `CLAMAV_ENABLED` / `EMAIL_TRANSPORT=smtp` / `OCR_ENABLED`
- Push واقعی، تست نفوذ، پایلوت میدانی

## Runtime
- Web `:3005` · API `:3006` · Redis worker · Postgres
