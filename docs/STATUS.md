# وضعیت اجرای پروژه

آخرین به‌روزرسانی: ۲۱ سپتامبر ۲۰۲۶ — **رستم R1–R9 هسته · تعمیق DoD برای R4/R6/R7**

## جواب

**نقشه فنی ۰–۵ و Dong 2.۰ (موج‌های ۰–F) در کد بسته‌اند.**  
**نقشه رستم:** R1–R3 · R5 · R8 ✅ کامل. R4/R6/R7/R9 هسته + تعمیق DoD در این پاس. جزئیات: canvas `rostam-roadmap`.

| گام | وضعیت دقیق |
|-----|------------|
| R1–R3 · R5 · R8 | DONE |
| R4 | خانه/briefing/error≠empty + axe ۵ تم + e2e fold موبایل |
| R6 | storybook سخت · a11y finance fail-closed (`A11Y_REQUIRE_FINANCE=1` + API در CI) · visual hard پس از commit baseline لینوکس |
| R7 | pen-test pack · ABAC **v5** + UI سقف `approvalCapMinor` · Vault فقط از capabilities |
| R9 | persistence مختلط صادق · badges · digest/Depth · i18n partners/procurement · SoT اسناد |

**SoT اسناد:**
| موضوع | منبع حقیقت |
|--------|------------|
| وضعیت محصول / Done | همین [`STATUS.md`](./STATUS.md) |
| ناوبری / chrome / مسیر canonical | [`IA.md`](./IA.md) |
| امنیت / residual / pen-test | [`security/PENTEST-REMEDIATION-TRACKER.md`](./security/PENTEST-REMEDIATION-TRACKER.md) |
| پایلوت میدانی | [`ops/PILOT.md`](./ops/PILOT.md) |
| Visual regression | [`ops/VISUAL-REGRESSION.md`](./ops/VISUAL-REGRESSION.md) |

**توضیح برای کاربر:** خلوت‌سازی اشتباهِ خانه (حذف نمای موبایل و موزاییک کامل) برگردانده شد. تغییر عمدی فقط روی نوار کارت‌مانند بالای خرج/گروه/ابزار بود.

**ناوبری ops:** کارت‌های تکراری بالای خرج→نوار متنی؛ گروه/من/سازمان→بدون میان‌بر تکراری با تب‌ها.

**ظاهر / موزاییک:** بدون بازگشت به `/hub` به‌عنوان chrome اصلی. ارتقا:
| مورد | وضعیت |
|------|--------|
| ۵ تم: dark / light / dusk / mist / **linear** | DONE — `data-theme` + دیالوگ «تنظیم ظاهر» |
| ۴ پس‌زمینه: آرام / مش / کاغذ / **اورورا** (`ember`) | DONE — SVG آبی‌فیروزه‌بنفش مثل دانش‌بان |
| gem palettes روی کاشی‌های Contextual Mosaic | DONE |
| More گروه‌بندی intent + پوشه `?intent=` + سنجاق + اخیراً | DONE |
| تقویم UI همیشه شمسی (`JalaliDateField` + `formatFaDate*`) | DONE — ذخیره ISO میلادی |
| مسیر شفاف + UI سریع (prefetch · ابزارها · flat ≤۶ · پالت summary) | DONE |

**ورود / 503 (hotfix):** چرخهٔ ماژول `Expenses→Attachments→Jobs→Retention→Statements→Expenses` باعث crash بوت API و 503 روی پروکسی `:3005` می‌شد. رفع: `JobsModule` بدون `RetentionModule` (lazy `ModuleRef`)؛ `AttachmentsModule` بدون import Jobs (`@Global`)؛ `JobsModule` زود در `AppModule`؛ قفل depcruise + `module-cycle.guard.test.ts`.

**Catch-up sprint:** P1–P4 و T کدپذیر در [`ROADMAP-CATCHUP.md`](./ROADMAP-CATCHUP.md) ✅ DONE.

**Deepen pass (ناقص/نازک → سیم‌کشی واقعی):**
| مورد | وضعیت |
|------|--------|
| Approval tiers روی approve واقعی (expense/settlement/pay-on-behalf) | DONE — pending تا N تأیید · queue progress |
| `providers.makerChecker=four_eyes_tiers_v1` + `persistence.approvalDecisions` | DONE |
| `requirePlanFeature` / `planAllows` روی analytics/charts/costCenter/categoryBudget | DONE — 403 `plan_required` |
| Policy DSL داخل `requireAccess` (ABAC v5 · `approvalCapMinor` جانشین) | DONE |
| Jobs UI `retention.purge` + `providers.retention=purge_v1` | DONE |
| X-RateLimit روی expense/social/statements | DONE |
| prefs رویداد اعلان (+ `emailDigest`) مهاجرت `0072` | DONE |
| **اعمال prefs روی delivery واقعی** (`expensePosted` / `settlementClaimed` / `inviteAccepted` / `securityAlert`) | DONE — `providers.notificationEventPrefs=in_app_v1` |
| DI: prefs بدون چرخه WaveF↔Access↔Platform↔Notifications (ModuleRef lazy) | DONE |
| Jobs UI برای `inline_stub` (enqueue + recent؛ DLQ فقط Redis) | DONE |
| discard صف آفلاین + نام اعضای آنلاین در زنگ | DONE |
| enqueue آفلاین فراتر از draft/claim/لینک (submit/post/approve · confirm/dispute · remind · period · simplify) | DONE — `offline-post.ts` · `docs/ops/OFFLINE-SYNC.md` |
| i18n jobs + shell (پالت/وضعیت API) | DONE |
| حضور آنلاین روی صفحه اعضا (از SSE `presenceUserIds`) | DONE |
| اعلان امنیتی روی رویدادهای auth بیشتر (login_failed · password · session · MFA · export) | DONE — pref `securityAlert` |
| **۱۰۰٪ پوشش معنادار آفلاین** (~۱۳۳ enqueue؛ خارج: auth/preview/jobs/vault/PSP/binary) | DONE |
| **i18n کامل shell** (tools · MFA · mosaic · redirect · aria · loading) | DONE |
| **حضور: آنلاین/آفلاین وقتی SSE زنده؛ وگرنه «حضور خاموش»** | DONE — `presenceLive` |
| **اعلان rate_limited + MFA challenge fail** | DONE |
| **تم‌های متمایز Midnight/Daylight/Twilight/Fog/**Linear** + atmosphere آرام/مش/کاغذ/**اورورا** | DONE — `packages/ui/src/tokens.css` |
| **Gem غنی + sticker SVG + motion رفت‌وبرگشتی** | DONE |
| **استیکر روی empty/error/tour + پنل ظاهر غنی‌تر** | DONE — payments/catalog/friends/charts/auth |
| **Chrome/dock/tabs/cards/dataRow از flat SaaS خارج شد** | DONE — wash + accent + hub depth |
| **الگوی دانش‌بان (:3004): Linear+Aurora · دیالوگ تنظیم ظاهر · page-background** | DONE — بدون کپی Fluent |
| **تراکم + Work Center nav + hubHero + header/dock شفاف** | DONE — ارتقا یافته برای دنگ |
| **غنی‌سازی خودکار مسیرهای Operations + trail مسیر** | DONE — `operations-nav.ts` · ShellPageTrail |
| **موزاییک رنگی دانش‌بان: gem per-route + glow تیره** | DONE — `ROUTE_GEM` · palettes شادتر |
| HttpVault opt-in + timeout + fail-closed | DONE |
| CI motion grep · fuzzyScore vitest · ContentSkeleton صفحات داغ | DONE |
| Maker-checker queue SLA (`MAKER_CHECKER_SLA_HOURS` · `slaDueAt`/`slaBreached` · `makerCheckerSla=hours_v1`) | DONE |
| UI صف تأیید: پیشرفت سطح + مهلت SLA در لیست | DONE |
| بارگذاری بخش‌بندی‌شده مالی (`loadWorkspaceData` + `section`) | DONE |
| صداقت: OpenAPI ledger/settlement · `providers.fx` · `providers.ledgerRebuild=ack_v1` | DONE |

**Chrome (پس از یکپارچه‌سازی دامنه + عمق):** `ShellPageTrail` روی زیرصفحات؛ بدون strip ops؛ ابزارها/Palette با ۵ دامنه + زیرگروه بصری مالی؛ خانه با «نیازمند تصمیم» و شروع سه‌تایی؛ badge تأیید از `GET …/approval-queue/count` فقط وقتی count>0.

**W6 ops (محصولی — نه Dong 2.0 E/F):** عمق عملیاتی واقعی بدون vendor ابری.

| Must | وضعیت |
|------|--------|
| Outbox redrive (بازه + `POST /platform/outbox/redrive` + دکمه admin) | DONE — مهاجرت `0065` · `OUTBOX_REDRIVE_INTERVAL_MS` |
| Jobs UI enqueue (`ledger.rebuild_balances` / `recurrence.tick` / `analytics.etl` / `retention.purge`) | DONE — فقط owner/admin · وقتی `jobs=redis_queue` |
| Worker job `analytics.etl` | DONE — meta actor مثل recurrence |
| Canary deepen | DONE — fail اگر Redis پیکربندی شده و heartbeat worker مرده؛ SLO اختیاری با `CANARY_CHECK_SLO` |
| Security-ops: severity + auth + export JSON | DONE — از فیلتر/لیست واقعی |

**Hotfix کنسول (پس از W6):** جداول `social.*` با `0066` ترمیم؛ DI `WaveFSettings` (notification-prefs)؛ palette بدون `t` شکننده؛ SSE reconnect آرام روی 503؛ `parseMinorBigInt` برای statements؛ `persistence.social` صادق.

**W7 رشد/پایلوت (محصولی):** DONE — دعوت نشست‌محور، دوستان+تطبیق، آنبوردینگ، tour، whats-new، demo تایپی، متریک `invite.create`، [`PILOT.md`](./ops/PILOT.md).

**عمق نازک‌ها (پس از W7):**

| مورد | وضعیت |
|------|--------|
| `ops.job_run` durable + `persistence.jobRuns` | DONE — مهاجرت `0067` · enqueue + worker write-back (`0071`: `finished_at`/`last_error`) |
| Tour prefs حساب (`GET/PUT /me/ui-prefs`) + localStorage fallback | DONE |
| Demo seed ساده: `SEED_WORKSPACE_DEMO` تایپی | DONE |
| Friend → member یک‌کلیک (owner/admin/finance) | DONE · وگرنه لینک اعضا |
| `GET /me/social-counts` | DONE — شمارش حساب؛ نه قیف workspace |
| SSE: attempt/delay در UI | DONE |
| First-run i18n + PWA cache `dang-shell-v3` | DONE |
| `retention.purge` + docs/ops/RETENTION.md | DONE |
| Policy-audit UI روی `/w/.../permissions` | DONE — owner/admin/auditor |

| Should / صادقانه باز | یادداشت |
|----------------------|---------|
| visual **hard** CI لینوکس | soft روی ویندوز |
| Vault / Grafana / PITR ابری · CRDT · ML | خارج از برش |
| React DevTools / HMR logs | نویز توسعه — خطا نیست |

**موج‌های محصولی باقی‌مانده در برش فعلی: ۰.**  
کار بعدی فقط **فاز provider** (کلید شما): SMTP / زرین‌پال / ClamAV / OCR / FX زنده / Push — نه Mustهای کد بدون کلید.

**Depth D0–D4 + UI discovery (بدون vendor ابری):** جزئیات [`docs/ROADMAP-DEPTH-D0-D4.md`](./ROADMAP-DEPTH-D0-D4.md).

| عمیق (DONE) | PARTIAL / عمداً باز |
|-------------|---------------------|
| کشف کنسول سامانه از حساب/More/پالت | visual **hard** CI لینوکس |
| `/w/.../security-ops` + outbox stats + redrive | multi-device CRDT |
| offline list+retry + enqueue خرج/تسویه/لینک پرداخت | ML antifraud |
| SSE محلی؛ با Redis → `sse_redis` fan-out | Pact / VPAT امضا |
| maker-checker توضیح در approvals | cloud PITR / Vault / Grafana |
| **Statements v1 depth:** share builders، CSV/JSON، browser print، payout workspace، RLS `0063`، seal مقصد، clear payout، audit export/notify/download، retention 7d، rate-limit notify، ABAC `rbac_abac_v3` | **PDF سرور عمداً رد شد** (چاپ مرورگر کافی؛ Puppeteer سنگین) · ایمیل SMTP · زرین‌پال |

**مرحله ۱۰:** همهٔ R10-01…25 حداقل یک برش دارند؛ عمق بیرونی (Vault ابری، PITR ابری، کلید PSP، vendor تست نفوذ) عمداً باز — جایگزین محلی در Depth پر شده. فهرست در [`docs/ROADMAP-STAGE-10.md`](./ROADMAP-STAGE-10.md).

**PWA:** بله — `manifest.webmanifest` + `/sw.js`؛ عمق offline = mutation queue محلی (نه CRDT).

**مرحله ۱۱:** S11-01…14 در کد؛ مهاجرت‌های 0044…**0072** در journal (`0072_notification_event_prefs`).

### Statements — صادقانه

- **هست:** لیست/جزئیات/export/notify/payout(+clear)، UI حرفه‌ای، URL sync (+`catalogItemId` با totals فیلترشده صادق)، لینک از مانده/تسویه/دوره، `providers.payoutDestinationCrypto`، ABAC statement/payout
- **نیست / رد شده:** PDF سرور (تصمیم: چاپ مرورگر + CSV/JSON؛ بدون Chromium) · ایمیل اجباری · custody کارت PSP
- **نیاز runtime:** `pnpm db:migrate` برای RLS/expiry؛ master key برای seal (وگرنه plaintext صادق در capabilities)
- **چک‌لیست RLS:** [`docs/ops/FINANCE-RLS-CHECKLIST.md`](./ops/FINANCE-RLS-CHECKLIST.md)
- **ارسال به عضو:** [`docs/ops/STATEMENTS-SEND.md`](./ops/STATEMENTS-SEND.md)
- **W3 بیرونی:** SMTP + زرین‌پال **plug-in** — [`PROVIDERS-RUNBOOK.md`](./ops/PROVIDERS-RUNBOOK.md)
- **W4 محصول مالی (عمیق):** `confirm-simplify-claims` + تأیید طلبکار/مدیر؛ `preview-effect` از ledger زنده؛ UI Amount/صفرجمع؛ فیلتر کاتالوگ صورتحساب (چاپ+URL)؛ export صادقانه بدون فیلتر
- **W4 تکمیل‌شده (پس از W5):** فیلتر `catalogItemId` روی لیست خرج (#15، API+URL+UI)؛ یادآوری بدهی دستی `POST …/balances/remind-debt` (#18)؛ تطبیق سهم→پرداخت/تسویه از صورتحساب (#19)؛ smoke e2e ساده‌سازی (soft skip بدون seed)

فاز ۴ محصولی (کلید واقعی PSP/SMTP/AV/OCR و تبدیل FX / شارژ اشتراک) فقط با پیکربندی و provider واقعی — بدون UI جعلی.

### تکمیل‌شده (فنی)
- Zod روی همه `@Body()` · CI + branch protection · fail-closed AV
- Zero-sum ledger · Argon2id · Redis rate-limit/idempotency/DLQ
- MFA/TOTP + recovery · a11y smoke · bundle budget · license check · Storybook · i18n scaffold
- مسیر مشتری / IA — `docs/IA.md` (`/w/[slug]/…`، `/members`، `/org-finance`)
- داشبورد workspace/personal با aggregate واقعی (`/workspaces/:id/dashboard`, `/me/dashboard`)
- guest/auditor: مخفی‌سازی جهش در مالی، گروه، org، تدارکات، پیشنهاد، گزارش/تکرار
- LocalPSP + Local Key Vault + in-app SLO + pay-on-behalf
- UI depth: security-ops، outbox redrive، jobs enqueue، offline queue، SSE Redis fan-out

### عمداً باز (کلید / عملیات شما)
- `ZARINPAL_ENABLED` / `CLAMAV_ENABLED` / `EMAIL_TRANSPORT=smtp` / `OCR_ENABLED`
- تبدیل زنده FX · شارژ Freemium · Push واقعی · تست نفوذ vendor · پایلوت میدانی

## Runtime
- Web `:3005` · API `:3006` · Redis worker · Postgres
- Canary: [`docs/ops/CANARY-DEPLOY.md`](./ops/CANARY-DEPLOY.md) · Analytics ETL: [`docs/ops/ANALYTICS-WAREHOUSE.md`](./ops/ANALYTICS-WAREHOUSE.md)
- پایلوت: [`docs/ops/PILOT.md`](./ops/PILOT.md)
