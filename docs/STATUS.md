# وضعیت اجرای پروژه

آخرین به‌روزرسانی: ۶ سپتامبر ۲۰۲۶ — baseline لانچ + نقشه فنی ۰–۴

## جواب

**نقشه فنی / محصولی ۰–۴ و baseline لانچ (چک‌لیست `docs/PHASE5.md`) تکمیل شد.**

فاز ۵ بک‌لاگ بلندمدت است (MFA، a11y، i18n، DLQ، …) و مانع لانچ احتیاطی نیست.

### تکمیل‌شده (فنی)
- ZodValidationPipe روی همه `@Body()` در API
- CI + branch protection + fail-closed AV policy
- Zero-sum ledger، Argon2id، rate-limit/idempotency Redis-ready
- مسیر مشتری / IA (خانه · زمینه · خرج‌ها · بیشتر) — `docs/IA.md`

### عمداً باز (کلید / عملیات شما)
- `ZARINPAL_ENABLED` / `CLAMAV_ENABLED` / `EMAIL_TRANSPORT=smtp` / `OCR_ENABLED`
- Push واقعی، تست نفوذ، پایلوت میدانی

## Runtime
- Web `:3005` · API `:3006` · Redis worker · Postgres

آدرس LAN: `http://192.168.140.105:3005`
