# ASVS L2 — بسته شواهد (R10-02 برش ۱)

مبنای کنترل: [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) سطح ۲.  
این سند **گواهی رسمی ASVS نیست** — نقشهٔ کنترل‌های پیاده‌شده به شواهد کد/CI است. شکاف‌ها صریح علامت خورده‌اند.

آخرین به‌روزرسانی: ۱۴۰۵/۰۶/۲۱ · مرجع اجرا: [`docs/exec/S10-B2.md`](../exec/S10-B2.md)

## نحوهٔ استفاده

1. قبل از بتا: ردیف‌های «شکاف» را با مالک اولویت‌بندی کنید.
2. DAST: [`docs/ops/DAST-ZAP.md`](../ops/DAST-ZAP.md) و workflow `dast-zap`.
3. تست نفوذ بیرونی و بستن یافته‌ها: R10-22 (جدا).

## نقشهٔ کنترل‌های کلیدی

| ASVS (خلاصه) | وضعیت | شواهد |
|--------------|--------|--------|
| V2 Auth — Argon2id / session hash | ✅ | `apps/api/src/auth/password.ts` · `docs/LOCAL-AUTH.md` |
| V2 MFA TOTP + recovery | ✅ | `mfa.service.ts` · `docs/MFA-STORAGE.md` |
| V2 TOTP at-rest AEAD + rotation window | ✅ برش | `totp-secret-crypto.ts` · `docs/ops/KEY-ROTATION.md` |
| V2 Vault/KMS خارجی | ⬜ شکاف | R10-06 باقی‌مانده |
| V3 Session — HttpOnly cookie | ✅ | `session-cookie.ts` · middleware gate |
| V3 CSRF double-submit | ✅ | `csrf.guard.ts` · web `api/client` |
| V3 Rate-limit auth | ✅ | `rate-limit.ts` · Redis fail-closed prod |
| V4 Access — role sets | ✅ برش | `access-policy.ts` · `requireAnyRole` |
| V4 ABAC کامل | 🟡 جزئی | `rbac_abac_v1` روی مسیرهای داغ (R10-05 برش ۷)؛ DSL/PDP باز |
| V4 Tenant isolation / RLS | ✅ | migrations RLS · `packages/db/tests` · R10-24 |
| V5 Input — Zod on bodies | ✅ | `zod-validation.pipe.ts` |
| V7 Error — Problem Details | ✅ | `problem-details.filter.ts` |
| V7 No secret leak in health | ✅ | `health.controller.ts` · S10-04 |
| V8 Data protect — audit append-only + hash-chain | ✅ | R10-04 · migrations `0040`/`0041` |
| V9 Communication — Helmet / CORS | ✅ | `main.ts` · `cors-origin.ts` |
| V10 Malicious — AV fail-closed | ✅ | `av-policy.ts` |
| V11 Business — idempotency / ledger zero-sum | ✅ | idempotency · ledger services |
| V12 Files — MIME allow-list | ✅ | attachments quarantine |
| V13 API — OpenAPI + internal job HMAC | ✅ | Swagger · `internal-job-auth.ts` |
| V14 Config — gitleaks + audit in CI | ✅ | `.github/workflows/ci.yml` |
| V14 DAST baseline in pipeline | ✅ برش | `.github/workflows/dast-zap.yml` |
| Logging → SIEM | ✅ برش | `SecurityEventsService` · `docs/ops/SIEM-SECURITY-EVENTS.md` · R10-15 |
| Pen-test + remediation | ✅ آماده‌سازی | threat model · scope · tracker · attack-surface · R10-22؛ engagement بیرونی باز |

## معیار خروج این برش (نه کل R10-02)

- [x] این ماتریس شواهد موجود و لینک‌شده از SECURITY / STATUS
- [x] ZAP baseline قابل اجرا در GitHub Actions (هدف URL صریح)
- [ ] صفر Critical/High باز روی هدف staging پایدار (نیاز به URL واقعی + triage)
- [ ] پوشش کامل فصل‌های ASVS L2 با ممیزی دستی (خارج از این برش)

## ارجاعات

- `docs/SECURITY.md`
- `docs/SECURITY-HARDENING.md`
- `docs/ops/DAST-ZAP.md`
- `docs/ops/KEY-ROTATION.md`
