# چک‌لیست انتشار (پایلوت داخلی / LocalPSP)

مرجع موارد: `kara-logs/dong-upgrade-plan.md` بخش فاز ۷.  
بدون ادعای SMTP / SMS / درگاه بیرونی. نتایج فاز ۷ (محلی روی `dev`، ۱۴۰۵/۰۸/۰۲) و پیگیری اجرای ۲ در جدول زیر.

| # | مورد | دستور / شواهد | نتیجه (فاز ۷ + اجرای ۲) |
|---|------|----------------|-------------------------|
| 1 | typecheck / lint / build | `pnpm check` | فاز ۷: typecheck و lint پاس. `pnpm check` کامل در اجرای بعدی تأیید شود. |
| 2 | تست واحد | `pnpm test` | فاز ۷: **پاس** |
| 3 | coverage | `pnpm test:coverage` | قراردادها + web در فاز ۴؛ آستانه‌ها در `packages/contracts` / web |
| 4 | audit high+ | `pnpm audit --audit-level=high` | فاز ۷: **رد** (Storybook / zod / undici). اجرای ۲: ارتقای zod `≥4.6.6`، Storybook `≥8.6.19`، override `undici@8=8.12.2` — نتیجهٔ نهایی در `kara-logs/run2-report.md` |
| 5 | license | `pnpm license:check` | فاز ۷: **پاس** |
| 6 | bundle | `pnpm bundle:check` | فاز ۷: **پاس** (~۴٫۲۶ MiB) |
| 7 | migrate همگام | journal = SQL؛ applied شامل `0090`/`0091`/`0092` | اجرای ۲: `0092_social_rls` + backup schema قبل از migrate |
| 8 | smoke سلامت | `pnpm smoke:health` | فاز ۷: **پاس** روی API `:3006` + web `:3005` |
| 9 | capabilities صادق | `antivirus` / `payment` / `email` از API | stub/LocalPSP برچسب‌دار؛ بدون ادعای زرین‌پال زنده |
| 10 | SBOM | `pnpm sbom:generate` | فاز ۷: **پاس** → `artifacts/sbom.cdx.json` |
| 11 | OpenAPI break | `pnpm openapi:break` | فاز ۷: **پاس** (additive) |
| 12 | canary policy | `pnpm canary:policy:test` | فاز ۷: **پاس** (واحد؛ URL زنده نیاز `CANARY_*`) |
| 13 | visual hard | فاز ۶ + baseline لینوکس | ویندوز در فاز ۷ پاس؛ لینوکس نیاز `workflow_dispatch` روی GitHub |
| 14 | a11y | `pnpm test:a11y` | فاز ۷: رد جزئی (contrast + timeout). اجرای ۲: timeoutها اصلاح؛ contrast فقط فهرست در گزارش (بدون تغییر رنگ) |
| 15 | فاصله با `origin/dev` | تصمیم push صریح مالک | push در این اجراها انجام نشد |
| 16 | عمداً خارج | SMTP · SMS · Zarinpal/PSP خارجی | خارج از scope پایلوت |

## یادداشت صداقت

- پرداخت = LocalPSP / stub تا کلید درگاه واقعی نباشد.
- ایمیل = غیر SMTP مگر پیکربندی واقعی.
- آمادگی انتشار سقف طرح: ≈۶٫۵ بدون سبز کردن جعلی stubها.

## مراجع

- [`docs/ops/PHASE5-HARDENING.md`](./ops/PHASE5-HARDENING.md) — جدول فاز ۷
- [`docs/STATUS.md`](./STATUS.md)
- [`docs/SECURITY.md`](./SECURITY.md) — residualها
