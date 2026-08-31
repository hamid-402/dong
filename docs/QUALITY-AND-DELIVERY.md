# کیفیت، تست و تحویل

## 1. قواعد Repository

- Branch Protection و Pull Request اجباری
- No self-merge
- CODEOWNERS برای Ledger، Auth، Authorization، Migration، CI و Infra
- حداقل یک Reviewer؛ تغییر مالی/امنیتی دو Reviewer
- PR کوچک با هدف، ریسک، تست، Migration و Rollback
- Dependency جدید با دلیل، License، Maintenance و CVE Review
- Warning جدید مجاز نیست.
- ۱۵٪ ظرفیت هر Iteration برای کیفیت، امنیت و بدهی فنی

## 2. هرم تست

### Unit/Domain

محاسبات، Value Object، State Machine، Policy و Validation.

### Property-based

- جمع Ledger صفر می‌ماند.
- Reversal اثر خالص را صفر می‌کند.
- Retry اثر مالی اضافه نمی‌سازد.
- مجموع سهم‌ها دقیقاً مبلغ را حفظ می‌کند.
- Role یا Tenant غیرمجاز دسترسی ندارد.
- Rounding و Serialization Invariant را نمی‌شکنند.

### Integration

PostgreSQL واقعی، RLS، Transaction، Redis، Queue و Object Storage.

### Contract

OpenAPI، Backward Compatibility و Adapterهای Payment/OCR/SMS.

### E2E

ورود، دعوت، خرج، تقسیم، درخواست، تأیید، خرید، تحویل، تجهیز، تسویه، Export و حذف.

### Security

BOLA/BFLA، CSRF، SSRF، Mass Assignment، Webhook Replay، Upload و Privilege.

### Accessibility

WCAG 2.2 AA، Keyboard، Focus، Contrast، RTL، NVDA/TalkBack.

### Performance و Recovery

Load، Spike، Soak، Noisy Tenant، Duplicate Job، Provider Failure و Restore.

## 3. Coverage

- کل کد جدید: حداقل ۸۰٪ Line و Branch
- Ledger، Authorization، Tenant Middleware و Payment: حداقل ۹۰٪ Branch
- کاهش Coverage ممنوع
- Mutation Score هدف Ledger و Authorization: ۷۰٪
- Flaky Test دارای Owner و SLA اصلاح حداکثر هفت روز

Coverage جایگزین Assertion باکیفیت نیست.

## 4. کنترل‌های هر Pull Request

1. Frozen Lockfile Install
2. Format و ESLint
3. Dependency Boundary
4. TypeScript Strict
5. Unit و Property Test
6. Integration Test
7. Migration روی DB خالی و Snapshot
8. RLS Isolation Suite
9. OpenAPI Breaking-change Check
10. Secret Scan، SAST و SCA/License
11. Container/IaC Scan
12. Build و SBOM

روی Main/Release:

- E2E و Smoke
- DAST روی Staging
- Signed Artifact و Provenance
- Deploy بر اساس Digest
- Canary و Post-deploy Smoke

## 5. Release

- Trunk-based Development
- Build Once، Promote Same Artifact
- Canary: Internal/Opt-in → 5٪ → 25٪ → 100٪
- کنترل Error Rate، Latency، Reconciliation و Audit در هر مرحله
- Auto Rollback بر اساس SLO Burn Rate
- Migration به روش Expand/Contract
- Down Migration مخرب خودکار ممنوع

## 6. محیط‌ها

- Local
- Test Disposable
- Preview Ephemeral
- Staging Production-like با داده Synthetic
- Production

Credential، Account و Database محیط‌ها جداست. Feature Flag دارای Owner، Expiry،
Default امن و Audit است و هرگز Authorization، MFA یا Audit را خاموش نمی‌کند.

## 7. SLO اولیه

- Availability API: 99.9٪ ماهانه
- Correctness Ledger: 100٪
- موفقیت Command مالی معتبر: 99.95٪
- Read p95: کمتر از 400ms
- Write p95: کمتر از 800ms
- OCR: 99٪ Job معتبر زیر پنج دقیقه
- RPO: حداکثر پنج دقیقه
- RTO: حداکثر ۶۰ دقیقه
- Audit Ingestion: 99.99٪

## 8. Observability

- OpenTelemetry Trace، Metric و Structured Log
- Trace ID، Request ID و شناسه داخلی Tenant
- PII، Token، OCR Text و حساب کامل در Telemetry ممنوع
- Dashboard: API، DB Pool، Slow Query، Queue Lag، Posting، Webhook، OCR و Notification
- Alert بر اساس Burn Rate
- هر Alert دارای Owner و Runbook
- Journal Imbalance همیشه Critical

## 9. Backup و DR

- PITR و WAL Archive
- Backup رمزنگاری‌شده و Immutable خارج از Account اصلی
- Object Storage Versioning
- Backup تنظیمات OIDC و KMS Metadata
- Restore ماهانه در محیط ایزوله
- DR Drill فصلی
- صحت‌سنجی Ledger، RLS، File و Audit پس از Restore

## 10. Definition of Done

Story فقط وقتی Done است که:

- Acceptance و Failure State پوشش داده شده‌اند.
- Threat، Data Class و Permission بررسی شده‌اند.
- تست‌ها و CI سبز هستند.
- Audit و Observability وجود دارد.
- RTL و Accessibility بررسی شده‌اند.
- Migration، Compatibility و Rollback روشن است.
- Critical/High باز وجود ندارد.
- مستندات، Runbook و Changelog به‌روز هستند.
- Feature Flag دارای Owner و تاریخ حذف است.

## 11. SLA آسیب‌پذیری

- Critical: مانع Release؛ مهار یا اصلاح حداکثر ۲۴ ساعت
- High: حداکثر هفت روز
- Medium: حداکثر ۳۰ روز
- Low: حداکثر ۹۰ روز
