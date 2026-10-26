# چک‌لیست انتشار (پایلوت داخلی / LocalPSP)

مرجع موارد: `kara-logs/dong-upgrade-plan.md` بخش فاز ۷.  
بدون ادعای SMTP / SMS / درگاه بیرونی. نتایج محلی روی `dev` تا **اجرای ۵** (۱۴۰۵/۰۸/۰۳).

| # | مورد | دستور / شواهد | نتیجه (نهایی تا اجرای ۵) |
|---|------|----------------|-------------------------|
| 1 | typecheck / lint / build | `pnpm check` | typecheck و lint پاس (اجرای ۳–۵) |
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
| 13 | visual hard | فاز ۶ + baseline لینوکس | **ویندوز:** baselineهای win32 در اجرای ۴ تأیید شد. **تنها مورد باز:** `workflow_dispatch`ی `visual-baseline-capture` روی GitHub (ubuntu). |
| 14 | a11y | `pnpm test:a11y` | اجرای ۵: **۴۵/۴۵** (`PLAYWRIGHT_CHANNEL=chrome`، next.dev `:3005` + API `:3006`). token اسکوپ‌شدهٔ `--finance-muted-ink` (#6e6967، ≈۴٫۷:۱). helper session cookie mirror برای `shell:137`. **ثبت‌شده بدون تغییر اندازه:** `target-size` روی `/spaces` همچنان residual شناخته‌شده است (در این اجرا fail نشد / فقط مستند). `.dang-control` دست‌نخورده. |
| 15 | فاصله با `origin/dev` | تصمیم push صریح مالک | push در این اجراها انجام نشد |
| 16 | عمداً خارج | SMTP · SMS · Zarinpal/PSP خارجی | خارج از scope پایلوت |

## مورد باز (صریح)

1. **`visual-baseline-capture` (Linux)** — تنها blocker برای hard gate بصری؛ باید روی GitHub اجرا و artifact لینوکس commit شود.
2. **`target-size` روی `/spaces`** — ثبت در اجرای ۵؛ بدون تغییر اندازهٔ المان (محدودیت اجرا). رفع جداگانه در صورت نیاز به ۴۵/۴۵ کامل.
3. **پیشنهاد (غیرمسدودکننده):** سخت‌کردن آستانهٔ visual پس از پایداری baseline لینوکس.

## یادداشت صداقت

- پرداخت = LocalPSP / stub تا کلید درگاه واقعی نباشد.
- ایمیل = غیر SMTP مگر پیکربندی واقعی.
- آمادگی انتشار سقف طرح: ≈۶٫۵ بدون سبز کردن جعلی stubها.
- **prod / migration `0093`:** نقش `dang_runtime` باید **قبل از** اجرای `0093_directory_public_settings` وجود داشته باشد؛ در غیر این صورت `GRANT EXECUTE` داخل بلوک `IF EXISTS (pg_roles…)` بی‌صدا انجام نمی‌شود و runtime به تابع دسترسی نخواهد داشت.
- **قبل از prod (رسید / صندوق — `0096`/`0097`):** ردیف‌های قدیمی `payment_receipt` بدون گیرنده (`payee_user_id` و `payee_fund_id` هر دو NULL) را backfill کنید؛ سپس `VALIDATE CONSTRAINT` برای `payment_receipt_payee_exactly_one_chk` و `payment_receipt_payee_fund_workspace_fk` اجرا شود.

## مراجع

- [`docs/ops/PHASE5-HARDENING.md`](./ops/PHASE5-HARDENING.md) — جدول فاز ۷
- [`docs/ops/VISUAL-REGRESSION.md`](./ops/VISUAL-REGRESSION.md)
- [`docs/STATUS.md`](./STATUS.md)
- [`docs/SECURITY.md`](./SECURITY.md) — residualها
- `kara-logs/run4-report.md` — جزئیات اجرای ۴

## بدهی فنی

- tokenهای `--module-chrome-title`، `--module-chrome-desc` و `--ux-secondary-action-link` (کامیت 614f450) بیرون از اسکوپ مالی عملاً اثری ندارند، چون قواعد با اولویت بالاتر رنگ را تعیین می‌کنند (baselineهای visual تغییری نکردند). در بازبینی بعدی CSS یا حذف شوند یا یکپارچه شوند. contrast مالی با `--finance-muted-ink` در `.financeAaScope` رفع شده است (efbb8e5).