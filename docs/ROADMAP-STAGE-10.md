# نقشه راه مرحله ۱۰ — Hardening، امنیت، و آمادگی تولید

| فیلد | مقدار |
|------|--------|
| وضعیت | **B5 تا برش ۸ + B2 تا برش ۷ · باقی‌ماندهٔ عمیق / engagement بیرونی** |
| تاریخ | ۱۴۰۵/۰۶/۲۱ (۱۲ سپتامبر ۲۰۲۶) |
| مرجع ADR | [ADR-operations-room-contextual-mosaic.md](./adr/ADR-operations-room-contextual-mosaic.md) |
| منبع | ممیزی QA + پیشنهادهای سنگین تأییدشدهٔ مالک (R10-01…25) |
| قانون | additive فقط · بدون داده جعلی · قابلیت قبلی حذف نشود |
| پرونده‌های اجرایی | [docs/exec/](./exec/README.md) — جزئیات ایده→طراحی→تصمیم→اجرا→تست |

> مرحلهٔ ۱۰ قبلاً فقط «سازگاری مسیر classic + hash» را بست (۱۰a). این سند همان مرحله را به
> **برنامهٔ کامل سخت‌سازی و استاندارد سازمانی** گسترش می‌دهد.
> بسته‌های بسته‌شده: … · [S10-B5](./exec/S10-B5.md) ✅ تا برش ۸ (maker queue نازک) · [S10-B2](./exec/S10-B2.md) ✅ تا برش ۷ ABAC سبک · باقی: عمق Vault/ABAC-DSL/soak و engagement pen-test بیرونی.

---

## ۱. هدف مرحله ۱۰

سامانه به سطح «محصول حرفه‌ای قابل دفاع برای تولید / بتا بستهٔ سازمانی» برسد:

1. شکاف‌های امنیتی P1 بسته شود.
2. دسترسی عمق‌لینک و صداقت مسیرها با ناوبری یکی شود.
3. اتمیک بودن مسیرهای مالی حیاتی + Outbox سراسری.
4. Ops، observability، DR، و دروازه‌های امنیت/کیفیت استاندارد.
5. IAM مرکزی، حریم خصوصی، دسترس‌پذیری، i18n، و کنترل‌های مالی سنگین.
6. رگرسیون تست (ماتریس نقش، axe، contract، visual، isolation، بار).

---

## ۲. موج الف — یافته‌های ممیزی (S10 · اولویت اول)

### ۲.۱ بسته A1 — امنیت سطح دسترسی و نشست (P1)

| ID | کار | شواهد / محل |
|----|-----|-------------|
| S10-01 | CSRF دوبل‌سابمیت برای mutationهای کوکی‌محور | `docs/SECURITY.md` ادعا vs `session-cookie` / `api/client` |
| S10-02 | Rate-limit احراز هویت: fail-closed یا limiter محلی سخت + الزام Redis در prod | `apps/api/src/auth/rate-limit.ts` |
| S10-03 | حذف اتکای middleware به `dang_web_session` قابل جعل از JS؛ گیت با نشست HttpOnly واقعی | `middleware.ts` · `session-cookies.ts` |
| S10-04 | حذف نشت `allowDevAuth` / جزئیات امنیتی از `health/ready` عمومی | `health.controller.ts` · capabilities |
| S10-05 | قطع کامل ماژول demo/seed در production build (نه فقط flag) | `demo-seed.service.ts` · `demo.controller.ts` |
| S10-06 | محدود کردن CORS LAN خصوصی به non-production | `apps/api/src/main.ts` |

### ۲.۲ بسته A2 — اسرار و هویت سرویس (P1)

| ID | کار | شواهد / محل |
|----|-----|-------------|
| S10-07 | رمزنگاری AEAD/KMS برای `totp_secret` (نه plaintext) | `migrations/0033_mfa_totp.sql` · `MFA-STORAGE.md` |
| S10-08 | توکن job داخلی: هویت سرویس ثابت + امضای HMAC روی actor/workspace | `recurrence-run.guard.ts` · worker |

### ۲.۳ بسته A3 — IA، مسیر، دسترسی صفحه (P1)

| ID | کار | شواهد / محل |
|----|-----|-------------|
| S10-09 | صفحه classic redirect برای `/overview` | `workspace-paths.ts` |
| S10-10 | Gate سطح صفحه برای deep-link وقتی ماژول/قالب/پرچم نامعتبر است | `navigation-v2` vs views |
| S10-11 | هم‌ترازی نقش برای metrics/audit با ناوبری و API | drift سیاست نقش |
| S10-12 | یکدست‌سازی لینک دفتر شخصی / personal ledger در ناوبری | inconsistency |

### ۲.۴ بسته A4 — صحت دامنه مالی (P1)

| ID | کار | شواهد / محل |
|----|-----|-------------|
| S10-13 | اتمیک‌سازی post خرج/تسویه با ثبت journal | `expenses.service.ts` · `settlements.service.ts` |
| S10-14 | تست regression شکست mid-flight | contracts + API store |

### ۲.۵ بسته A5 — Ops و UX خطا (P2)

| ID | کار | شواهد / محل |
|----|-----|-------------|
| S10-15 | UI مشاهده‌پذیری Jobs/DLQ برای owner/admin وقتی `jobs=redis_queue` | `jobs.controller.ts` |
| S10-16 | `error.tsx` / `not-found.tsx` RTL + Forbidden یکدست | `apps/web/src/app` |
| S10-17 | هم‌خوانی ARCHITECTURE با بسته‌های دامنه یا dependency-cruiser | `docs/ARCHITECTURE.md` |

### ۲.۶ بسته A6 — کیفیت و رگرسیون پایه (P2)

| ID | کار | شواهد / محل |
|----|-----|-------------|
| S10-18 | ماتریس template × flag × role روی صفحه | e2e |
| S10-19 | گسترش axe + بستن TODO keyboard-journey | `a11y-shell.spec.ts` |
| S10-20 | تست deep-link gate و `/overview` redirect | web e2e |

---

## ۳. موج ب — استانداردهای سنگین سازمانی (R10 · تأیید مالک · داخل تعهد ۱۰)

همهٔ موارد زیر **جزء تعهد مرحله ۱۰** هستند (additive؛ وابستگی به کلید واقعی فقط جایی که صریحاً نوشته شده).

### ۳.۱ بسته B1 — Observability و معماری توزیع‌شده

| ID | کار | برآورد تقریبی |
|----|-----|---------------|
| R10-01 | OpenTelemetry end-to-end (trace خرج→ledger→job) + داشبورد SLO | ۲–۳ هفته · **برش پایه OTLP+ALS** + **in-app SLO (`providers.slo=in_app_v1`)**؛ Grafana خارجی باز |
| R10-03 | Transactional Outbox سراسری برای رویدادهای دامنه | ۲–۴ هفته |
| R10-11 | مرزبندی سخت Domain Packages + dependency-cruiser در CI | ۲–۳ هفته |

### ۳.۲ بسته B2 — امنیت سازمانی و انطباق

| ID | کار | برآورد تقریبی |
|----|-----|---------------|
| R10-02 | بسته شواهد ASVS L2 + DAST در CI (ZAP baseline) | ۲ هفته · **برش شواهد+workflow انجام**؛ triage staging / گواهی کامل باز |
| R10-04 | Audit log غیرقابل‌تغییر (append-only / hash-chain یا WORM) | ۲ هفته |
| R10-05 | موتور سیاست دسترسی مرکزی (RBAC+ABAC) | ۳–۴ هفته · **`rbac_abac_v2` + grants · finance mutations via requireAccess**؛ DSL/PDP کامل باز |
| R10-06 | Vault/KMS + چرخش کلید نشست/TOTP/job | ۲ هفته · **برش چرخش env انجام** · **Local Key Vault عمیق (`local_vault_v1`) انجام**؛ Vault/KMS بیرونی همچنان اختیاری |
| R10-15 | SIEM hooks / structured security events + نگهداری لاگ سیاست‌محور | ۱–۲ هفته · **store محلی `ops.security_event` + structured_log**؛ SIEM محصولی باز |
| R10-22 | Threat model سالانه + تست نفوذ خارجی با بستن یافته‌ها | بیرونی + remediation · **برش آماده‌سازی انجام**؛ engagement/vendor + بستن High باز |
| R10-24 | Suite خودکار اثبات isolation چندمستأجری روی جداول حساس | ۱–۲ هفته |

### ۳.۳ بسته B3 — تاب‌آوری، ظرفیت، تحویل

| ID | کار | برآورد تقریبی |
|----|-----|---------------|
| R10-07 | Disaster Recovery: PITR Postgres + تمرین restore مستند | ۱–۲ هفته + drill · **منطقی+CI** + **WAL محلی `.dang/wal-archive` + timed/dry-run**؛ PITR ابری باز |
| R10-08 | Chaos / failover برای Redis و Postgres | ۱–۲ هفته · **برش failover محلی انجام**؛ mesh/cluster باز |
| R10-09 | بار و soak با k6 روی مسیر طلایی + بودجه SLO شبانه | ۱–۲ هفته · **برش golden-path+workflow انجام**؛ soak شبانه باز |
| R10-16 | Canary/blue-green deploy با auto-rollback روی health | ۱–۲ هفته + infra · **برش gate اسکریپتی انجام**؛ ارکستراتور ابری باز |

### ۳.۴ بسته B4 — کیفیت نرم‌افزار و دسترس‌پذیری

| ID | کار | برآورد تقریبی |
|----|-----|---------------|
| R10-10 | Contract testing (Pact یا معادل) Web↔API | ۱–۲ هفته · **برش Zod+live انجام**؛ Pact broker باز |
| R10-12 | i18n کامل fa/en با ICU + استخراج رشته‌های محصول | ۲–۳ هفته · **برش auth+خطا انجام**؛ ICU کامل/shell باز |
| R10-13 | WCAG 2.2 AA کامل (خودکار + ممیزی دستی + VPAT خلاصه) | ۲ هفته · **برش VPAT خلاصه+axe22 انجام**؛ ممیزی کامل باز |
| R10-23 | Visual regression (Playwright screenshots) روی shell و مالی | ۱ هفته · **برش اسکلت opt-in انجام**؛ baseline CI سخت باز |

### ۳.۵ بسته B5 — محصول، داده، کنترل مالی

| ID | کار | برآورد تقریبی |
|----|-----|---------------|
| R10-14 | Export دادهٔ کاربر + حذف/ناشناس‌سازی GDPR-like | ۲–۳ هفته · **برش account export+anonymize انجام**؛ DSAR کامل باز |
| R10-17 | antifraud/anomaly روی تسویه و دعوت | ۲–۳ هفته · **heuristics_v1 (تسویه+دعوت) انجام**؛ ML باز |
| R10-18 | Realtime presence/notifications با WebSocket یا SSE صادق | ۲–۳ هفته · **برش SSE محلی+presence انجام**؛ Redis/WebSocket باز |
| R10-19 | Offline-first sync قوی (صف mutation + conflict policy) برای PWA | ۳–۴ هفته · **برش صف mutation+server-wins انجام**؛ PWA/CRDT باز |
| R10-20 | انبار دادهٔ تحلیلی فقط‌خواندنی (replica + ETL) | ۲–۳ هفته · **برش schema+ETL+API+UI انجام**؛ dbt/CDC/BI کامل باز |
| R10-21 | صورتحساب/اشتراک واقعی (metering + invoice + LocalPSP/webhook PSP) | ۳–۵ هفته · **LocalPSP مسیر اصلی + metering+invoice+pay-gate انجام**؛ proration/trial باز |
| R10-25 | Maker-checker سراسری برای جهش‌های مالی بالای سقف | ۲ هفته · **چهارچشم + صف نازک در approval-queue**؛ جدول/SLA جدا باز |

---

## ۴. ترتیب پیشنهادی اجرا

```text
موج الف (سریع‌ترین ریسک)
  A1 → A3 → A2 → A4 → A5 → A6

موج ب (روی الف؛ موازی‌سازی با تیم جدا مجاز)
  B2 پایه (R10-05, R10-06, R10-04, R10-24)
  موازی B1 (R10-03 با A4 هم‌راستا · R10-01 · R10-11)
  سپس B3 (R10-07…09 · R10-16)
  سپس B4 (R10-10 · R10-12 · R10-13 · R10-23)
  سپس B5 (R10-14 · R10-17 · R10-25 · R10-18 · R10-19 · R10-20)
  R10-02 و R10-22 نزدیک دروازهٔ بتا/تولید
  R10-21 با LocalPSP (بدون کلید بیرونی)؛ Zarinpal اختیاری با کلید
```

وابستگی‌های سخت پیشنهادی:

- R10-03 تکمیل/جایگزین طبیعی S10-13/14 است؛ پس از یا همراه A4.
- R10-05 باید قبل از گسترش نقش‌های جدید در B5 باشد تا drift تکرار نشود.
- R10-06 قبل از ادعای production برای TOTP/job tokens.
- R10-21 با LocalPSP در UI واقعی است؛ زرین‌پال فقط با کلید (قانون no-fake-data).

---

## ۵. معیار خروج مرحله ۱۰

### ۵.۱ موج الف

- [x] هیچ یافتهٔ P1 ممیزی باز نیست (S10-01 … S10-14).
- [x] Jobs/DLQ در UI برای نقش مجاز وقتی صف واقعی است (S10-15).
- [x] error/not-found/forbidden محصولی (S10-16).
- [x] سند معماری یا cruiser با واقعیت یکی است (S10-17).
- [x] ماتریس e2e + axe سبز برای ماژول‌های هدف (S10-18…20).
- [x] capabilities/health عمومی جزئیات امنیتی حساس لو نمی‌دهد.
- [ ] typecheck + unit + integrationsReady سبز.

### ۵.۲ موج ب

- [ ] R10-01…R10-25 همه انجام یا با استثنای زمان‌دار مکتوب مالک (فقط برای وابستگی کلید بیرونی مثل بخشی از R10-22؛ R10-21 با LocalPSP بسته شد).
- [x] برش پایه R10-01: OTLP batch export وقتی `OTEL_EXPORTER_OTLP_ENDPOINT` ست است؛ `providers.tracing` صادق؛ span طلایی HTTP→service→job؛ داشبورد SLO/Grafana بیرونی باز.
- [x] عمق R10-01 in-app: `GET /platform/slo` + `/admin/slo` + `providers.slo=in_app_v1` از outbox/DLQ/security (بدون Grafana).
- [x] Outbox یا معادل اتمیک برای رویدادهای دامنه مالی فعال است (R10-03).
- [x] سیاست دسترسی مرکزی برش `rbac_abac_v1` روی مسیرهای داغ؛ DSL/PDP کامل باز (R10-05).
- [x] شواهد ASVS L2 + اسکلت DAST/ZAP در CI (R10-02 برش)؛ صفر High روی staging پایدار هنوز باز.
- [x] تمرین restore منطقی در CI + runbook PITR (R10-07 برش)؛ drill ابری زمان‌مند هنوز باز.
- [x] عمق R10-07 محلی: `pnpm dr:wal:archive` → `.dang/wal-archive`؛ `pnpm dr:wal:dry-run` در CI؛ PITR ابری باز.
- [x] isolation خودکار چندمستأجری سبز (R10-24).
- [x] WCAG 2.2 AA سطوح عمومی + VPAT خلاصه (R10-13 برش)؛ ممیزی کامل باز.
- [x] i18n fa/en برای auth/خطا (R10-12 برش)؛ shell/مالی باز.

---

## ۶. خارج از محدودهٔ مرحله ۱۰ (عمداً)

- فعال‌سازی OCR/AV/SMTP **بدون** کلید واقعی (UI جعلی ممنوع)
- ادعای `providers.payment=zarinpal` بدون merchant + `ZARINPAL_ENABLED` (LocalPSP جایگزین صادق است)
- حذف مسیرهای classic قبل از بستن DESIGN-SYSTEM §12 traffic review
- بازنویسی کامل UI خارج از Operations Room / Mosaic قفل‌شده
- Microservice اجباری قبل از تثبیت Modular Monolith + مرز دامنه (R10-11)

---

## ۷. کنترل تغییرات

| نسخه | تاریخ | تغییر |
|------|-------|--------|
| 1.0 | ۱۴۰۵/۰۶/۲۱ | گسترش مرحله ۱۰ با یافته‌های ممیزی (S10-01…20) + صف R10 منتظر تأیید |
| 1.1 | ۱۴۰۵/۰۶/۲۱ | تأیید مالک: R10-01…25 وارد تعهد اجرایی مرحله ۱۰ (موج ب) |
| 1.2 | ۱۴۰۵/۰۶/۲۱ | A1 (S10-01…06) پیاده‌سازی و DoD بسته شد — ر.ک. docs/exec/S10-A1.md |
| 1.3 | ۱۴۰۵/۰۶/۲۱ | A3 (S10-09…12) پیاده‌سازی و DoD بسته شد — ر.ک. docs/exec/S10-A3.md |
| 1.4 | ۱۴۰۵/۰۶/۲۱ | A2 (S10-07…08) پیاده‌سازی و DoD بسته شد — ر.ک. docs/exec/S10-A2.md |
| 1.5 | ۱۴۰۵/۰۶/۲۱ | A4 (S10-13…14) پیاده‌سازی و DoD بسته شد — ر.ک. docs/exec/S10-A4.md |
| 1.6 | ۱۴۰۵/۰۶/۲۱ | A5 (S10-15…17) پیاده‌سازی و DoD بسته شد — ر.ک. docs/exec/S10-A5.md |
| 1.7 | ۱۴۰۵/۰۶/۲۲ | R10-01 برش پایه OTLP (batch+flush، capabilities صادق؛ داشبورد SLO خارجی باز) |
| 1.8 | ۱۴۰۵/۰۶/۲۲ | عمق D2: in-app SLO (outbox/DLQ/security) + WAL محلی/RPO dry-run بدون Grafana/PITR ابری |
