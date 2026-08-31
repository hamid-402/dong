# Hardening و چک‌لیست امنیتی (فاز ۵)

## کنترل‌های پیاده‌شده در کد

| کنترل | وضعیت |
|---|---|
| Helmet روی API | ✅ |
| Problem Details | ✅ |
| Idempotency | ✅ |
| RLS migrations | ✅ (نیاز به migrate) |
| Payment بدون custody کارت | ✅ stub link |
| File MIME allow-list + quarantine stub | ✅ |
| OCR stub (بدون binary custody) | ✅ |
| Health live/ready | ✅ |
| PWA + offline draft | ✅ |
| OIDC | اختیاری / staging |
| DAST / Pen-test | چک‌لیست زیر — اجرا در staging |

## Payment — بدون Custody

- فقط `payment-links` با redirect به PSP
- فیلدهای `cardNumber` / `pan` / `cvv` با `PAYMENT_CUSTODY_FORBIDDEN` رد می‌شوند
- هیچ کیف پول یا موجودی نقدی در سیستم نگهداری نمی‌شود

## File Quarantine

1. Metadata ثبت می‌شود (نه بایت فایل در API فعلی)
2. `evaluateQuarantine` اجرا می‌شود (نام اجرایی / MIME غیرمجاز → `blocked`)
3. OCR فقط روی فایل‌های غیرمسدود

## چک‌لیست DAST (دستی / ابزار)

قبل از Beta روی Staging:

- [ ] OWASP ZAP Baseline روی `https://staging.../api/v1`
- [ ] بررسی CORS فقط به origin مجاز
- [ ] عدم نشت stack trace در 500
- [ ] Rate limit روی `/auth` و `/payment-links` (آینده)
- [ ] تست IDOR: عضو workspace A به workspace B دسترسی ندارد
- [ ] Headerهای امنیتی (Helmet) در پاسخ
- [ ] آپلود MIME خارج از allow-list → 400
- [ ] Payload با `cardNumber` روی payment-links → 400

ابزار پیشنهادی: ZAP، Nuclei (templates OWASP)، k6 برای smoke بار.

## Accessibility (حداقل)

- `lang=fa` + `dir=rtl`
- Skip link به `#main-content`
- `:focus-visible` مشخص
- `prefers-reduced-motion` رعایت شده
- Landmark `main` روی صفحات عملیاتی

## قبل از Production

1. Pen-test بدون Critical/High
2. DR Drill موفق (`docs/BACKUP-RESTORE.md`)
3. OIDC اجباری؛ `allowDevAuth=false`
4. `DANG_REQUIRE_POSTGRES=1`
5. تأیید Legal/Privacy/PSP
