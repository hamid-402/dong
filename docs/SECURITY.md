# امنیت و حریم خصوصی

مبنای کنترل: OWASP ASVS سطح ۲، کنترل‌های منتخب سطح ۳ برای مدیریت Tenant، عملیات
مالی، Export و Admin، به‌همراه OWASP API Security Top 10 و NIST SSDF.

بستهٔ شواهد کنترل→کد: [`docs/security/ASVS-L2-EVIDENCE.md`](./security/ASVS-L2-EVIDENCE.md).
DAST: [`docs/ops/DAST-ZAP.md`](./ops/DAST-ZAP.md).

## 1. Threat Model پایه

تهدیدهای اولویت‌دار:

1. عبور از مرز Tenant یا BOLA
2. تصاحب حساب و سوءاستفاده Recovery
3. ارتقای مجوز و سوءاستفاده داخلی
4. دستکاری یا ثبت تکراری Ledger
5. Callback/Webhook جعلی یا Replay
6. فایل، PDF یا تصویر مخرب
7. Mass Assignment، SSRF و Resource Exhaustion
8. نشت Secret و Supply-chain Compromise

Threat Model با هر Feature مالی یا Trust Boundary جدید و حداقل فصلی بازبینی می‌شود.

## 2. طبقه‌بندی داده

- C0 عمومی: محتوای عمومی
- C1 داخلی: تنظیمات غیرحساس و Telemetry تجمیعی
- C2 محرمانه: هویت، عضویت، فاکتور و گزارش مالی
- C3 محدود: Credential، Token، Export کامل، Audit و Backup

Production Data وارد Development نمی‌شود. داده Test مصنوعی است. C2/C3 در انتقال
و ذخیره رمزنگاری و دسترسی/Export آن Audit می‌شود.

## 3. Authentication

- OIDC استاندارد؛ Token سفارشی ممنوع
- Passkey/WebAuthn ترجیحی و TOTP جایگزین
- SMS فقط OTP/Recovery کم‌اعتماد
- **MFA (TOTP) برای Owner/Admin/Finance در فضاهای غیرشخصی و نقش‌های platform:** پیاده‌سازی شده — لاگین با رمز سپس چالش MFA قبل از کوکی نشست وقتی TOTP فعال است؛ برای نقش‌های حساس بدون MFA، `profile.mfaEnrollmentRequired=true` و **مسدودسازی سخت** عملیات مالی/حساس با `assertMfaEnrolledForSensitiveAction`. مالک فقط-شخصی برای ثبت‌نام MFA تحت فشار soft می‌ماند تا enrollment ممکن باشد. `totp_secret` با AES-256-GCM ذخیره می‌شود.
- **Step-up reauth:** `POST /auth/reauth` کوکی کوتاه‌عمر `dang_reauth` می‌سازد؛ برای export داده، حذف حساب، و عملیات admin vault (seal/unseal/rotate) الزامی است.
- **Job داخلی (worker→API):** علاوه بر `DANG_INTERNAL_JOB_TOKEN`، هدرهای HMAC (`x-dang-internal-ts` / `workspace-id` / `actor-user-id` / `sig`) الزامی‌اند؛ عضویت actor در workspace بررسی می‌شود.
- **Argon2id** برای پسوردهای جدید؛ هش‌های قدیمی scrypt در لاگین موفق به‌صورت transparent به Argon2id ارتقا می‌یابند
- Cookie با Secure، HttpOnly و SameSite=Lax برای `dang_session`
- **CSRF Protection (double-submit):** کوکی خوانا `dang_csrf` + هدر `X-CSRF-Token` روی mutationهای دارای نشست؛ کلاینت وب خودکار هدر می‌فرستد. مسیرهای ورود/ثبت‌نام/بازیابی رمز/`mfa/verify`/`logout` از CSRF معاف‌اند تا نشست کهنه بدون CSRF لاگین را قفل نکند؛ بقیهٔ mutationهای نشست‌دار همچنان اجباری‌اند.
- Rotation Session پس از Login یا تغییر Privilege
- Re-auth برای Export / حذف حساب / vault admin فعال است؛ گسترش به role-change در بک‌لاگ باقی است
- Recovery Code یک‌بارمصرف و Hash‌شده (فعال با MFA)
- Rate Limit و Anti-enumeration

## 4. Authorization

- RBAC + ABAC
- Deny by default
- کنترل Server-side برای هر Object و Action
- Field-level Permission برای داده حساس
- Maker-checker برای Role Change، Export و عملیات مالی
- Support بدون دسترسی پیش‌فرض؛ دسترسی JIT، زمان‌دار و Audit‌شده
- Service Account جدا، Scope محدود و Rotation

## 5. Tenant Isolation

- Tenant Context فقط از Session/Token معتبر
- Workspace-aware FK، Unique، Cache Key، Queue، Blob Path و Idempotency
- PostgreSQL RLS
- Signed URL کوتاه‌عمر
- Worker Tenant Context را دوباره اعتبارسنجی می‌کند.
- CI دارای Suite مستقل Cross-tenant است.
- Quota و Rate Limit بر اساس Tenant

## 6. Ledger و Audit

- Double-entry و Zero-sum
- Append-only برای Journal Posted
- Reversal به‌جای Delete
- Audit جدا از Application Log
- Actor، Tenant، Action، Target، Result، UTC، Trace و Policy Decision
- Secret، OTP، PAN، CVV و متن کامل حساس در Log ممنوع
- Hash Chain یا Signed Batch برای Audit در فاز بلوغ
- Gap در Audit Ingestion هشدار بحرانی است.

## 7. فایل و OCR

Pipeline:

```text
Presigned Upload
→ Quarantine
→ Size/MIME/Magic-byte validation
→ Malware scan
→ Metadata removal
→ Sandboxed OCR بدون Network
→ Confidence
→ Human review
→ Private storage
```

- Bucket عمومی ممنوع
- نام فایل Server-generated
- محدودیت Page، Pixel، CPU و Memory
- Download با URL کوتاه‌عمر و Authorization
- OCR حقیقت مالی نیست و مستقیماً Posted Entry نمی‌سازد.
- CSV Formula Injection Escape می‌شود.
- LLM به URL Fetch یا اقدام مالی خودکار دسترسی ندارد.
- **ClamAV (opt-in `CLAMAV_ENABLED=1`):** اسکن upload جدید اگر نتیجه‌ی `error` بدهد (daemon قطع، timeout، host خالی، بدون bytes) با HTTP **503** و problem type `https://dang.local/problems/av-unavailable` رد می‌شود و فایل به‌صورت قابل‌سرو ذخیره نمی‌شود. وقتی پرچم خاموش است مسیر stub MIME بدون تغییر است.
- **دانلود quarantine:** پیوست با `quarantineStatus=blocked` یا `error` با HTTP **400** و problem type `https://dang.local/problems/quarantine-blocked` رد می‌شود (**تغییر رفتار:** قبلاً فقط blocked در gate دانلود بود؛ اکنون error هم مثل blocked رد می‌شود). وقتی `CLAMAV_ENABLED=1` است، `pending` هم با همان 400 رد می‌شود تا اسکن کامل شود؛ وقتی پرچم خاموش است `pending` مثل قبل قابل‌دانلود می‌ماند. پیوست `clean` بدون اسکن مجدد قابل‌دانلود می‌ماند حتی وقتی ClamAV قطع است.

## 8. پرداخت No-custody

- Wallet، Escrow یا Balance قابل برداشت ساخته نمی‌شود.
- Hosted/Redirect Checkout رسمی Provider
- PAN/CVV وارد Backend، Log یا Analytics نمی‌شود.
- Redirect مرورگر اثبات پرداخت نیست.
- Verify سروربه‌سرور، Signature، Replay Protection و Idempotency
- وضعیت Unknown برای Timeout
- Reconciliation زمان‌بندی‌شده
- Refund و Dispute با Maker-checker

دامنه حقوقی و PCI با PSP و مشاور متخصص قبل از Production نهایی می‌شود.

## 9. Secrets و رمزنگاری

- Secret Manager/KMS
- Credential جدا برای Environment و Service
- Rotation و Revocation
- TLS 1.2 حداقل و ترجیح 1.3
- Encryption at rest برای DB، Storage، Queue و Backup
- AEAD استاندارد برای Field Encryption
- Password فقط Hash
- Key Inventory با Owner، Purpose و Rotation Date
- **Master key (MVP):** منبع کلید اصلی Local Key Vault از `DANG_MASTER_KEY` (یا فایل غیرprod `.dang/master.key`) است — در capabilities به‌صورت `providers.masterKeySource=env` گزارش می‌شود. برای مسیر اختیاری HTTP به HashiCorp Vault، `VAULT_ADDR` + `VAULT_TOKEN` (+ اختیاری `VAULT_MASTER_KEY_PATH`) را تنظیم کنید تا `masterKeySource=http_vault` شود؛ بدون این envها provider HTTP استفاده نمی‌شود و ادعای Vault بیرونی نمی‌شود. نبود کلید: `none` (vault sealed / فیلدهای بدون AEAD ممکن است plaintext بمانند).
- دسترسی encrypt/decrypt در `ops.vault_access_log` ثبت می‌شود (async، بدون بلاک مسیر گرم).

## 10. حریم خصوصی و Retention

- Data Inventory و Purpose برای هر Dataset
- جمع‌آوری حداقلی
- Export پس از Re-auth، Async Job و لینک کوتاه‌عمر
- حذف Tenant دو مرحله‌ای با Grace Period
- PII تا حد امکان از Ledger جداست.
- Tombstone مانع بازگشت داده حذف‌شده پس از Restore می‌شود.
- Blob، Thumbnail، Index و Cache هم‌زمان حذف می‌شوند.
- Retention مالی، Audit، فایل و OCR جدا و با تأیید حقوقی است.

## 11. Incident Response

سناریوهای Runbook:

- Account Takeover
- Tenant Leakage
- Ledger Tampering
- Secret Leak
- Ransomware
- PSP Fraud
- Malicious Upload

SEV1: پاسخ هدف ۱۰ دقیقه و مهار هدف ۶۰ دقیقه. Postmortem بدون سرزنش حداکثر پنج
روز کاری، همراه Owner و Deadline.

## Residual / شکاف‌های شناخته‌شده (فاز ۳)

- **جدول‌های social بدون RLS؛ پیشنهاد در [`docs/rls-social-proposal.md`](./rls-social-proposal.md)** (اعمال نشده — نیازمند بازبینی CTO).
- **RES-01:** HttpVault opt-in با تست واحد؛ **باز تا تأیید staging** (`masterKeySource=http_vault` روی staging).
- **RES-02:** ABAC محلی + `approvalCapMinor`؛ remote PDP ادعا نمی‌شود.
- **RES-03:** blocker — `ZAP_TARGET_URL` staging موجود نیست (parse gate واحد دارد).
- **RES-04:** خارج از scope درگاه؛ LocalPSP؛ بدون ادعای جعلی «زرین‌پال فعال».
- **RES-05:** وابسته به فاز ۶ (baseline لینوکس).
- **RES-06:** شروع نشده — vendor/تاریخ ندارد.

### Migration social directory (0045 / 0091)

`0045_social_directory_friends` در `drizzle.__drizzle_migrations` روی envهای dev که بعد از همگام‌سازی journal از دست رفته‌اند ممکن است **ردیف نداشته باشد**؛ چون `when` آن قدیمی‌تر از آخرین migration اعمال‌شده است، دوباره اجرا نمی‌شود. پوشش idempotent اشیای همان schema در `0091_social_directory_friends_cover` است. جزئیات: [`packages/db/README.md`](../packages/db/README.md).

## Supply-chain / وابستگی‌ها

- `braces` (GHSA-vfj7-8cjw-p6xm): ریسک پذیرفته‌شده است چون پچ رسمی ندارد و فقط در ابزار eslint (`eslint-config-next` → micromatch) استفاده می‌شود، نه runtime پرود.

### moderate باقی‌مانده (پس از فاز ۱ — `pnpm audit`)

| بسته | نسخه | Advisory | دلیل باقی‌ماندن |
|------|------|----------|-----------------|
| `esbuild` | 0.18.20 | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | transitive از `drizzle-kit` (ابزار migrate/generate)؛ پچ ≥0.25.0 بدون ارتقای tooling ممکن نیست و فقط روی dev server محلی اثر دارد، نه runtime پرود |
| `fast-uri` | 4.1.4 | [GHSA-hrr3-gc8f-f4qj](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj) | override فاز ۱ روی `4.1.4` (پچ high) قفل شده؛ moderate به ≥4.1.5 نیاز دارد و در batch بعدی overrides bump می‌شود |
| `fast-uri` | 3.1.7 | [GHSA-hrr3-gc8f-f4qj](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj) | override فاز ۱ روی `3.1.7` قفل شده؛ moderate به ≥3.1.8 نیاز دارد |
| `fast-uri` | 4.1.4 | [GHSA-jvvf-x445-j334](https://github.com/advisories/GHSA-jvvf-x445-j334) | همان پین `fast-uri@4=4.1.4`؛ پچ moderate ≥4.1.5 در فاز بعدی |
| `brace-expansion` | 1.1.20 | [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | override فاز ۱ روی `1.1.20`؛ فقط مسیر eslint/minimatch (dev)، نه runtime پرود؛ پچ ≥1.1.21 در فاز بعدی |
| `brace-expansion` | 2.1.6 | [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | override فاز ۱ روی `2.1.6`؛ مسیر `testcontainers` (dev/test)؛ پچ ≥2.1.7 در فاز بعدی |
| `brace-expansion` | 5.0.11 | [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | override فاز ۱ روی `5.0.11`؛ مسیر `typescript-eslint` (dev)؛ پچ ≥5.0.12 در فاز بعدی |

## منابع

- https://owasp.org/www-project-application-security-verification-standard/
- https://owasp.org/API-Security/
- https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html
- https://csrc.nist.gov/pubs/sp/800/218/final
- https://www.w3.org/TR/WCAG22/
