# روشن کردن providerهای بیرونی (W3) — plug-in

بدون کلید واقعی، UI دکمهٔ جعلی نشان نمی‌دهد — فقط capability/`stubs` صادق.
این سند مسیر **فقط وصل‌کردن کلید** برای ایمیل و زرین‌پال است.

## ایمیل (SMTP یا Resend)

### فعال‌سازی SMTP

در `.env`:

```env
SMTP_URL=smtp://USER:PASS@smtp.example.com:587
EMAIL_TRANSPORT=smtp
SMTP_FROM=دنگ همکاری <noreply@example.com>
```

هر دو `SMTP_URL` و `EMAIL_TRANSPORT=smtp` لازم است. سپس API را ری‌استارت کنید.

### یا Resend (اولویت بالاتر از SMTP)

```env
RESEND_API_KEY=re_...
SMTP_FROM=دنگ همکاری <onboarding@resend.dev>
```

اگر هر دو ست باشند، **Resend** استفاده می‌شود.

### چک زنده بودن

`GET /system/capabilities`:

- `providers.email` = `smtp` یا `resend`
- `stubs.emailDelivery` = `false`
- `integrationsReady.smtp.enabled` = true وقتی SMTP زنده است

### چه ایمیلی واقعاً می‌رود

| جریان | وضعیت |
|--------|--------|
| دعوت عضو (وقتی subject ایمیل است) | ✅ |
| تأیید ایمیل / فراموشی رمز | ✅ |
| weekly digest (wave-f) | ✅ |
| `statement.ready` | ✅ وقتی mailer زنده + عضو `email` معتبر دارد (همراه اعلان in-app) |
| MFA | TOTP اپ — ایمیل OTP نیست |

## زرین‌پال

### فعال‌سازی sandbox

```env
ZARINPAL_MERCHANT_ID=<merchant-sandbox>
ZARINPAL_ENABLED=1
ZARINPAL_PRODUCTION=0
# اختیاری — پیش‌فرض از API_BASE_URL ساخته می‌شود:
# ZARINPAL_CALLBACK_URL=https://YOUR_PUBLIC_HOST/api/v1/payments/zarinpal/callback
```

`pnpm db:migrate` تا `0064` (ستون `return_url` روی pending).

### تولید

```env
ZARINPAL_PRODUCTION=1
ZARINPAL_CALLBACK_URL=https://api.yourdomain.com/api/v1/payments/zarinpal/callback
```

در production، callback باید **HTTPS عمومی** باشد (نه localhost) — در غیر این صورت create لینک با 503 و کد `ZARINPAL_CALLBACK_*` رد می‌شود.

### رفتار

1. ایجاد لینک پرداخت → API زرین‌پال v4 `request` (کد ۱۰۰)
2. کاربر StartPay را می‌بیند
3. callback → verify با مبلغ سروری (کد ۱۰۰ یا ۱۰۱ = موفق/تکراری)
4. اگر `returnUrl` هنگام create ذخیره شده باشد → **302** به همان URL با `?payment=ok|failed`
5. بدون `returnUrl` قدیمی → JSON

### چک زنده بودن

- `providers.payment` = `zarinpal`
- `integrationsReady.zarinpal` = `{ merchantConfigured: true, enabled: true }`
- UI پرداخت‌ها برچسب «فعال (زرین‌پال)» نشان می‌دهد (نه LocalPSP)

بدون `ZARINPAL_ENABLED=1` همیشه **LocalPSP** محلی است (تست بدون درگاه).

## ترتیب پیشنهادی

1. SMTP/Resend → دعوت و statement.ready خارج از اپ
2. زرین‌پال sandbox با تونل (مثلاً cloudflared) به callback
3. ClamAV / OCR جدا (همین الگو: URL + `*_ENABLED=1`)

## عمداً باز

PDF سرور · Vault ابری · Push Web (بعد از ایمیل پایدار)
