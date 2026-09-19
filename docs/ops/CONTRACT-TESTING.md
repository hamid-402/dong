# Contract testing Web↔API (R10-10)

| فیلد | مقدار |
|------|--------|
| وضعیت | قرارداد مشترک `@dang/contracts` + Zod live check (عمق D3) |
| قانون | بدون Pact broker اجباری در این برش |

## منبع حقیقت

- انواع و Zod در `packages/contracts`
- Web و API هر دو از همین بسته import می‌کنند (consumer/provider مشترک)

## چک‌ها

```bash
# واحد
pnpm --filter @dang/contracts test

# زنده روی API در حال اجرا
pnpm contract:live
```

اسکریپت: `scripts/contract/live-api.mjs` — اعتبارسنجی Zod برای:

| مسیر | انتظار |
|------|--------|
| `GET /api/v1/health/ready` | ۲۰۰ + schema |
| `GET /api/v1/system/capabilities` | ۲۰۰ + `providers.payment` / `slo` / `paymentOnBehalf` |
| `GET /api/v1/payments/local/intents/:id` | ۴۰۴ problem (intent مفقود) یا ۲۰۰ LocalPSP schema |
| `GET /api/v1/platform/slo` | ۲۰۰ schema یا ۴۰۱/۴۰۴ problem (گیت نقش) |
| `GET …/payments/on-behalf` | ۲۰۰ list schema یا ۴۰۱/۴۰۳/۴۰۴ problem |

اختیاری: `CONTRACT_SESSION_COOKIE` و `CONTRACT_WORKSPACE_ID` برای مسیر احرازشدهٔ ۲۰۰.

## Pact کامل (خارج از برش)

Broker جدا، نسخه artifact، و CDC در pipeline جداگانه — وقتی تیم جدا برای consumerهای خارجی نیاز شد.
