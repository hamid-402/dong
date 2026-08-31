# امنیت و حریم خصوصی

مبنای کنترل: OWASP ASVS سطح ۲، کنترل‌های منتخب سطح ۳ برای مدیریت Tenant، عملیات
مالی، Export و Admin، به‌همراه OWASP API Security Top 10 و NIST SSDF.

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
- MFA اجباری Owner، Admin، Finance و Support
- Argon2id برای Password در صورت وجود Password
- Cookie با Secure، HttpOnly و SameSite
- CSRF Protection
- Rotation Session پس از Login یا تغییر Privilege
- Re-auth برای MFA، Export، Role Change و عملیات مالی حساس
- Recovery Code یک‌بارمصرف و Hash‌شده
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

## منابع

- https://owasp.org/www-project-application-security-verification-standard/
- https://owasp.org/API-Security/
- https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html
- https://csrc.nist.gov/pubs/sp/800/218/final
- https://www.w3.org/TR/WCAG22/
