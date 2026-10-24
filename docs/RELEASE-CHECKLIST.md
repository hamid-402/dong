# چک‌لیست انتشار (پایلوت داخلی / LocalPSP)

مرجع موارد: `kara-logs/dong-upgrade-plan.md` بخش فاز ۷.  
بدون ادعای SMTP / SMS / درگاه بیرونی. نتایج محلی روی `dev` تا **اجرای ۴** (۱۴۰۵/۰۸/۰۲).

| # | مورد | دستور / شواهد | نتیجه (نهایی تا اجرای ۴) |
|---|------|----------------|-------------------------|
| 1 | typecheck / lint / build | `pnpm check` | typecheck و lint پاس (اجرای ۳/۴) |
| 2 | تست واحد | `pnpm test` | **پاس** (اجرای ۳؛ RLS بدون `DATABASE_URL` → skip روشن) |
| 3 | coverage | `pnpm test:coverage` | قراردادها + web در فاز ۴؛ آستانه‌ها در `packages/contracts` / web |
| 4 | audit high+ | `pnpm audit --audit-level=high` | باقی‌ماندهٔ transitive (Storybook / …) — جزئیات `kara-logs/run2-report.md` |
| 5 | license | `pnpm license:check` | **پاس** |
| 6 | bundle | `pnpm bundle:check` | **پاس** (~۴٫۲۶ MiB) |
| 7 | migrate همگام | journal = SQL؛ applied شامل `0090`/`0091`/`0092` | `0092_social_rls` + backup schema (اجرای ۲) |
| 8 | smoke سلامت | `pnpm smoke:health` | **پاس** روی API `:3006` + web `:3005` |
| 9 | capabilities صادق | `antivirus` / `payment` / `email` از API | stub/LocalPSP برچسب‌دار؛ بدون ادعای زرین‌پال زنده |
| 10 | SBOM | `pnpm sbom:generate` | **پاس** → `artifacts/sbom.cdx.json` |
| 11 | OpenAPI break | `pnpm openapi:break` | **پاس** (additive) |
| 12 | canary policy | `pnpm canary:policy:test` | **پاس** (واحد؛ URL زنده نیاز `CANARY_*`) |
| 13 | visual hard | فاز ۶ + baseline لینوکس | **ویندوز:** baselineهای win32 (شامل payments/approvals/statements/statements-print) با standalone روی `:3005` در اجرای ۴ تأیید/بازتولید شد. **تنها مورد باز:** اجرای `workflow_dispatch`ی `visual-baseline-capture` روی GitHub (ubuntu) برای `*-chromium-linux.png`. پیشنهاد: پس از commit لینوکس، آستانهٔ `maxDiffPixelRatio` را در صورت پایداری سخت‌تر کنید (فعلاً دست نخورده). |
| 14 | a11y | `pnpm test:a11y` | اجرای ۴: **۴۳/۴۵** (`PLAYWRIGHT_CHANNEL=chrome` روی next.dev). `a11y-finance` seeded و `shell:139` پاس. باقی: `target-size` روی `/spaces`؛ یک `color-contrast` روی `.dang-control` در مسیر landmarks seeded (خارج از scope token اجرای ۴). خروجی Playwright به `artifacts/playwright/` منتقل شد تا reload watcher کمتر شود. |
| 15 | فاصله با `origin/dev` | تصمیم push صریح مالک | push در این اجراها انجام نشد |
| 16 | عمداً خارج | SMTP · SMS · Zarinpal/PSP خارجی | خارج از scope پایلوت |

## مورد باز (صریح)

1. **`visual-baseline-capture` (Linux)** — تنها blocker برای hard gate بصری؛ باید روی GitHub اجرا و artifact لینوکس commit شود.
2. **پیشنهاد (غیرمسدودکننده):** سخت‌کردن آستانهٔ visual پس از پایداری baseline لینوکس. در اجرای ۴، capture با standalone بدون `ERR_ABORTED` بود؛ اگر `ERR_ABORTED` فقط روی standalone دیده شد، همان را ثبت کنید (روی next.dev معمولاً به HMR/خروجی داخل `apps/web` مربوط بود و با `outputDir` بیرون از درخت وب کاهش یافت).

## یادداشت صداقت

- پرداخت = LocalPSP / stub تا کلید درگاه واقعی نباشد.
- ایمیل = غیر SMTP مگر پیکربندی واقعی.
- آمادگی انتشار سقف طرح: ≈۶٫۵ بدون سبز کردن جعلی stubها.

## مراجع

- [`docs/ops/PHASE5-HARDENING.md`](./ops/PHASE5-HARDENING.md) — جدول فاز ۷
- [`docs/ops/VISUAL-REGRESSION.md`](./ops/VISUAL-REGRESSION.md)
- [`docs/STATUS.md`](./STATUS.md)
- [`docs/SECURITY.md`](./SECURITY.md) — residualها
- `kara-logs/run4-report.md` — جزئیات اجرای ۴
