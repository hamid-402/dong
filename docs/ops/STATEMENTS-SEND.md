# ارسال صورتحساب سهم‌محور به عضو

راهنمای یک‌صفحه‌ای عملیاتی (آیتم #12 نقشه ارتقا). بدون ایمیل اجباری.

## پیش‌نیاز

1. `pnpm db:migrate` (حداقل تا `0063`)
2. `GET /system/capabilities` → `providers.statements = csv_json_print_v1`
3. عضو در فضا باشد؛ نقش مالی برای دیدن/اعلان دیگران

## مسیر کوتاه

1. `/w/[slug]/statements?from=YYYY-MM-DD&to=YYYY-MM-DD`
2. عضو را از ریل انتخاب کنید (غیرمالی فقط خودش را می‌بیند).
3. تطبیق سهم vs پرداخت در پایین صورتحساب (قابل‌پرداخت / بستانکار).
4. **خروجی:** دکمه CSV یا JSON → فایل با انقضای ۷ روز؛ دانلود authenticated.
5. **چاپ / PDF کاربر:** لینک چاپ مرورگر (PDF سرور عمداً نیست).
6. **اعلان داخل‌برنامه:** «آماده‌سازی اعلان» فقط برای نقش مالی → `statement.ready` در زنگوله.
7. **ایمیل (اختیاری):** وقتی `providers.email` زنده است و عضو ایمیل معتبر دارد، همان notify ایمیل هم می‌فرستد — ر.ک. [`PROVIDERS-RUNBOOK.md`](./PROVIDERS-RUNBOOK.md).
8. **دستور واریز:** تنظیمات فضا `#payout` (owner/admin) — کارت/شبا؛ clear با DELETE.

## اگر گیر کردید

| نشانه | علت رایج |
|--------|----------|
| capability خاموش | persistence/providers statements |
| 403 روی عضو دیگر | نیاز `statement.read_any` (مالی/حسابرس یا grant) |
| 403 روی payout | فقط owner/admin (`payout.manage`) |
| اعلان نمی‌رسد | rate-limit یا نقش غیرمالی |

## عمداً باز

زرین‌پال · SMTP واقعی · PDF سرور
